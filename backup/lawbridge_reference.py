
# lawbridge_reference.py
# Reference implementation of the LawBridge protocol parser and refresh handling in Python.
# Author: ChatGPT
# License: MIT
#
# Features:
# - Streaming parser for LawBridge commands:
#   STX (0x02) + Command + Data + ETX (0x03)
# - Fixed-length data per command, per the spec.
# - Document model maintaining text, and a simple timecode->position index.
# - Two refresh strategies:
#     * "buffer" (Mode A): buffer content until E; then atomically replace range.
#     * "stream" (Mode B): delete immediately; insert refresh data live until E.
# - Safe handling of delete/backspace (D) within active insertion region.
# - Hooks to observe page, line, format, and prevent-save (K) changes.
#
# Usage:
#   from lawbridge_reference import LawBridgeParser, RefreshMode
#   parser = LawBridgeParser(refresh_mode=RefreshMode.BUFFER)  # or .STREAM
#   parser.feed(b"...byte stream...")
#   print(parser.document_text())
#
# NOTE:
# - This is a reference for integration; adapt to your UI/formatting model as needed.
# - ASCII text outside of STX..ETX frames is inserted at the current insertion point.
# - Timecodes are [HH,MM,SS,FF] at 30 FPS. We store a simple map to latest char offset.

from __future__ import annotations
from dataclasses import dataclass
from enum import Enum, auto
from typing import List, Tuple, Optional, Dict

STX = 0x02
ETX = 0x03

# Command lengths (data bytes after command letter, before ETX)
CMD_LEN = {
    b'P': 2,  # Page (little endian word)
    b'N': 1,  # Line
    b'F': 1,  # Format
    b'T': 4,  # Timecode [HH,MM,SS,FF]
    b'R': 8,  # Refresh: start TC[4] + end TC[4]
    b'E': 0,  # End refresh
    b'D': 0,  # Delete
    b'K': 0,  # Prevent save
}

class ParserState(Enum):
    NORMAL = auto()
    REFRESH = auto()

class RefreshMode(Enum):
    BUFFER = auto()  # Mode A: buffer then replace on E
    STREAM = auto()  # Mode B: in-place streaming insert during refresh

@dataclass(frozen=True, order=True)
class Timecode:
    hh: int
    mm: int
    ss: int
    ff: int  # frames (30 fps)

    def to_frames(self) -> int:
        return ((self.hh * 60 + self.mm) * 60 + self.ss) * 30 + self.ff

    @staticmethod
    def from_bytes(b: bytes) -> "Timecode":
        if len(b) != 4:
            raise ValueError("Timecode must be 4 bytes [HH,MM,SS,FF]")
        return Timecode(b[0], b[1], b[2], b[3])

    def __str__(self) -> str:
        return f"{self.hh:02}:{self.mm:02}:{self.ss:02}:{self.ff:02}"

class Document:
    """
    A minimal text document that stores characters and supports insertion, deletion,
    and getting/setting an insertion point. Tracks a simple time index mapping
    timecodes to character offsets.
    """
    def __init__(self) -> None:
        self._chars: List[str] = []  # full document content
        self._insertion: int = 0     # current insertion offset (0..len)
        self.time_index: Dict[int, int] = {}  # frame_count -> char offset
        # Optional state
        self.current_page: Optional[int] = None
        self.current_line: Optional[int] = None
        self.current_format: Optional[int] = None
        self.prevent_save: bool = False

    # --- core text ops ---
    def set_insertion(self, pos: int) -> None:
        self._insertion = max(0, min(pos, len(self._chars)))

    def get_insertion(self) -> int:
        return self._insertion

    def insert_text(self, s: str) -> None:
        if not s:
            return
        pos = self._insertion
        # Insert characters at pos
        for ch in s:
            self._chars.insert(pos, ch)
            pos += 1
        self._insertion = pos

    def delete_backspace(self, lower_bound: int = 0) -> None:
        """
        Delete the character immediately before the insertion point,
        but do not delete before lower_bound.
        """
        if self._insertion > lower_bound and self._insertion > 0:
            del self._chars[self._insertion - 1]
            self._insertion -= 1

    def delete_range(self, start: int, end: int) -> None:
        start = max(0, min(start, len(self._chars)))
        end = max(0, min(end, len(self._chars)))
        if end > start:
            del self._chars[start:end]
            self._insertion = start

    def length(self) -> int:
        return len(self._chars)

    def text(self) -> str:
        return ''.join(self._chars)

    # --- state updates ---
    def on_page(self, page_le: bytes) -> None:
        page = int.from_bytes(page_le, byteorder='little', signed=False)
        self.current_page = page

    def on_line(self, line_b: bytes) -> None:
        self.current_line = line_b[0]

    def on_format(self, fmt_b: bytes) -> None:
        self.current_format = fmt_b[0]

    def on_timecode(self, tc: Timecode) -> None:
        # Index maps to the *current* insertion point
        self.time_index[tc.to_frames()] = self._insertion

    def on_prevent_save(self) -> None:
        self.prevent_save = True

class LawBridgeParser:
    """
    Streaming parser for the LawBridge protocol with refresh handling.
    """
    def __init__(self, refresh_mode: RefreshMode = RefreshMode.BUFFER) -> None:
        self.state = ParserState.NORMAL
        self.refresh_mode = refresh_mode
        self.doc = Document()

        # Refresh bookkeeping
        self._refresh_start_tc: Optional[Timecode] = None
        self._refresh_end_tc: Optional[Timecode] = None
        self._refresh_start_pos: Optional[int] = None
        self._refresh_end_pos: Optional[int] = None
        self._refresh_buffer: Optional[Document] = None  # Used in BUFFER mode
        self._refresh_lower_bound: int = 0  # lower bound for deletes in STREAM mode

        # Incremental command parsing
        self._frame_buf: bytearray = bytearray()
        self._in_cmd: bool = False
        self._expected_len: Optional[int] = None
        self._current_cmd: Optional[bytes] = None

    # --- public API ---
    def feed(self, data: bytes) -> None:
        """
        Feed raw bytes from the LawBridge stream.
        ASCII bytes outside of STX..ETX are treated as text.
        Commands are parsed according to fixed lengths.
        """
        for b in data:
            if not self._in_cmd:
                if b == STX:
                    self._enter_frame()
                else:
                    # ASCII text byte
                    self._insert_text_bytes(bytes([b]))
            else:
                # inside a command frame
                if self._current_cmd is None:
                    # First byte inside frame is command letter
                    self._current_cmd = bytes([b])
                    if self._current_cmd not in CMD_LEN:
                        # Unknown command; consume until ETX as a safety net.
                        self._expected_len = None
                        # We'll still require ETX to close the frame.
                    else:
                        self._expected_len = CMD_LEN[self._current_cmd]
                        if self._expected_len == 0:
                            # Next must be ETX
                            pass
                else:
                    # Accumulate or expect ETX depending on expected length
                    if self._expected_len is None:
                        # Unknown command: just wait for ETX
                        if b == ETX:
                            self._handle_unknown(self._current_cmd, bytes(self._frame_buf))
                            self._exit_frame()
                        else:
                            self._frame_buf.append(b)
                    else:
                        # Known command with fixed data length
                        if len(self._frame_buf) < self._expected_len:
                            self._frame_buf.append(b)
                        else:
                            # Expect ETX now
                            if b != ETX:
                                raise ValueError(f"Malformed frame for {self._current_cmd!r}: missing ETX")
                            self._dispatch_cmd(self._current_cmd, bytes(self._frame_buf))
                            self._exit_frame()

    def document_text(self) -> str:
        return self.doc.text()

    # --- frame helpers ---
    def _enter_frame(self) -> None:
        self._in_cmd = True
        self._current_cmd = None
        self._expected_len = None
        self._frame_buf.clear()

    def _exit_frame(self) -> None:
        self._in_cmd = False
        self._current_cmd = None
        self._expected_len = None
        self._frame_buf.clear()

    # --- command dispatch ---
    def _dispatch_cmd(self, cmd: bytes, payload: bytes) -> None:
        if cmd == b'P':
            self._on_page(payload)
        elif cmd == b'N':
            self._on_line(payload)
        elif cmd == b'F':
            self._on_format(payload)
        elif cmd == b'T':
            self._on_timecode(payload)
        elif cmd == b'D':
            self._on_delete()
        elif cmd == b'K':
            self._on_prevent_save()
        elif cmd == b'R':
            self._on_refresh_begin(payload)
        elif cmd == b'E':
            self._on_refresh_end()
        else:
            self._handle_unknown(cmd, payload)

    # --- command handlers ---
    def _on_page(self, payload: bytes) -> None:
        if self.state == ParserState.NORMAL:
            self.doc.on_page(payload)
        else:
            # During refresh:
            target = self._refresh_target_doc()
            target.on_page(payload)

    def _on_line(self, payload: bytes) -> None:
        if self.state == ParserState.NORMAL:
            self.doc.on_line(payload)
        else:
            target = self._refresh_target_doc()
            target.on_line(payload)

    def _on_format(self, payload: bytes) -> None:
        if self.state == ParserState.NORMAL:
            self.doc.on_format(payload)
        else:
            target = self._refresh_target_doc()
            target.on_format(payload)

    def _on_timecode(self, payload: bytes) -> None:
        tc = Timecode.from_bytes(payload)
        if self.state == ParserState.NORMAL:
            self.doc.on_timecode(tc)
        else:
            target = self._refresh_target_doc()
            target.on_timecode(tc)

    def _on_delete(self) -> None:
        if self.state == ParserState.NORMAL:
            self.doc.delete_backspace(lower_bound=0)
        else:
            if self.refresh_mode == RefreshMode.BUFFER:
                assert self._refresh_buffer is not None
                self._refresh_buffer.delete_backspace(lower_bound=0)
            else:
                # STREAM mode: enforce lower bound at refresh start
                self.doc.delete_backspace(lower_bound=self._refresh_lower_bound)

    def _on_prevent_save(self) -> None:
        # Global flag; last one wins.
        if self.state == ParserState.NORMAL:
            self.doc.on_prevent_save()
        else:
            # Apply to target (both modes ultimately reflect globally)
            target = self._refresh_target_doc()
            target.on_prevent_save()
            # Keep main doc in sync:
            self.doc.prevent_save = target.prevent_save

    def _on_refresh_begin(self, payload: bytes) -> None:
        if len(payload) != 8:
            raise ValueError("R payload must be 8 bytes: startTC[4] + endTC[4]")
        if self.state == ParserState.REFRESH:
            # For simplicity, we queue/disallow nesting; raise error or implement a queue.
            raise RuntimeError("Nested refresh not supported in reference impl")

        self._refresh_start_tc = Timecode.from_bytes(payload[:4])
        self._refresh_end_tc   = Timecode.from_bytes(payload[4:])
        s_pos, e_pos = self._resolve_time_range(self._refresh_start_tc, self._refresh_end_tc)
        self._refresh_start_pos = s_pos
        self._refresh_end_pos = e_pos

        if self.refresh_mode == RefreshMode.BUFFER:
            # Start a fresh buffer doc
            self._refresh_buffer = Document()
            self._refresh_buffer.set_insertion(0)
        else:
            # STREAM mode: delete immediately and set insertion point into doc
            self.doc.delete_range(s_pos, e_pos)
            self.doc.set_insertion(s_pos)
            self._refresh_lower_bound = s_pos

        self.state = ParserState.REFRESH

    def _on_refresh_end(self) -> None:
        if self.state != ParserState.REFRESH:
            # E outside of refresh -> ignore or log
            return

        if self.refresh_mode == RefreshMode.BUFFER:
            # Atomically replace [start,end) with buffer
            assert self._refresh_start_pos is not None and self._refresh_end_pos is not None
            assert self._refresh_buffer is not None
            buf_text = self._refresh_buffer.text()
            # Replace
            self.doc.delete_range(self._refresh_start_pos, self._refresh_end_pos)
            # Insert new content at start
            self.doc.set_insertion(self._refresh_start_pos)
            self.doc.insert_text(buf_text)
            # Merge any relevant flags if desired; for simplicity, copy prevent_save
            self.doc.prevent_save = self._refresh_buffer.prevent_save
        else:
            # STREAM mode: insertion point moves to end
            self.doc.set_insertion(self.doc.length())

        # Reset refresh state
        self.state = ParserState.NORMAL
        self._refresh_start_tc = None
        self._refresh_end_tc = None
        self._refresh_start_pos = None
        self._refresh_end_pos = None
        self._refresh_buffer = None
        self._refresh_lower_bound = 0

    # --- helpers ---
    def _insert_text_bytes(self, bs: bytes) -> None:
        try:
            s = bs.decode('ascii', errors='strict')
        except UnicodeDecodeError:
            # Replace invalid bytes with placeholder to keep the stream going
            s = bs.decode('ascii', errors='replace')
        if self.state == ParserState.NORMAL:
            self.doc.insert_text(s)
        else:
            if self.refresh_mode == RefreshMode.BUFFER:
                assert self._refresh_buffer is not None
                self._refresh_buffer.insert_text(s)
            else:
                self.doc.insert_text(s)

    def _handle_unknown(self, cmd: bytes, payload: bytes) -> None:
        # In production, you might log a warning. Here we just ignore.
        pass

    def _refresh_target_doc(self) -> Document:
        if self.state != ParserState.REFRESH:
            return self.doc
        if self.refresh_mode == RefreshMode.BUFFER:
            assert self._refresh_buffer is not None
            return self._refresh_buffer
        return self.doc  # STREAM mode writes directly to main doc

    def _resolve_time_range(self, start_tc: Timecode, end_tc: Timecode) -> Tuple[int, int]:
        """
        Map [start_tc, end_tc] to [start_pos, end_pos) in document.
        Policy:
          - Start anchor: nearest at-or-after; fallback to nearest before; else 0.
          - End anchor: nearest before-or-at; fallback to nearest after; else doc end.
        """
        start_frames = start_tc.to_frames()
        end_frames = end_tc.to_frames()
        if end_frames < start_frames:
            # Swap or treat as empty; here we swap to be forgiving
            start_frames, end_frames = end_frames, start_frames

        # If index is empty:
        if not self.doc.time_index:
            return (0, self.doc.length())

        keys = sorted(self.doc.time_index.keys())
        # Start: at-or-after
        s_pos = None
        for k in keys:
            if k >= start_frames:
                s_pos = self.doc.time_index[k]
                break
        if s_pos is None:
            # Nearest before
            before_keys = [k for k in keys if k <= start_frames]
            s_pos = self.doc.time_index[max(before_keys)] if before_keys else 0

        # End: before-or-at
        e_pos = None
        before_or_at = [k for k in keys if k <= end_frames]
        if before_or_at:
            e_pos = self.doc.time_index[max(before_or_at)]
        else:
            # Fallback to nearest after
            after_keys = [k for k in keys if k >= end_frames]
            e_pos = self.doc.time_index[min(after_keys)] if after_keys else self.doc.length()

        # Ensure valid ordering
        s_pos = max(0, min(s_pos, self.doc.length()))
        e_pos = max(0, min(e_pos, self.doc.length()))
        if e_pos < s_pos:
            s_pos, e_pos = e_pos, s_pos
        return (s_pos, e_pos)

# --- Utility to build frames ---
def frame(cmd: bytes, payload: bytes = b'') -> bytes:
    if cmd not in CMD_LEN:
        raise ValueError("Unknown command")
    expected = CMD_LEN[cmd]
    if len(payload) != expected:
        raise ValueError(f"Payload length for {cmd!r} must be {expected}, got {len(payload)}")
    return bytes([STX]) + cmd + payload + bytes([ETX])

def tc_bytes(hh: int, mm: int, ss: int, ff: int) -> bytes:
    return bytes([hh & 0xFF, mm & 0xFF, ss & 0xFF, ff & 0xFF])

def le_word(n: int) -> bytes:
    return int(n).to_bytes(2, 'little', signed=False)
