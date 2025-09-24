class LawBridgeParser {
  constructor() {
    this.STX = 0x02; // Start of text
    this.ETX = 0x03; // End of text
    this.buffer = Buffer.alloc(0);
    this.currentPage = 0;
    this.currentLine = 0;
    this.currentFormat = 0x00;
    this.currentTimecode = null; // Track current timecode for text association
    this.refreshMode = false;
    this.refreshStart = null;
    this.refreshEnd = null;
    this.refreshBuffer = [];
  }

  // Format type descriptions
  getFormatDescription(formatCode) {
    const formats = {
      0x00: 'Fixed line',
      0x01: 'Question',
      0x02: 'Answer',
      0x03: 'Speaker',
      0x04: 'Question continuation',
      0x05: 'Answer continuation',
      0x06: 'Speaker continuation',
      0x07: 'Parenthetical',
      0x08: 'Centered',
      0x09: 'Right-flush',
      0x0A: 'By line',
      0x0B: 'By line continuation'
    };
    return formats[formatCode] || `User-defined (0x${formatCode.toString(16).padStart(2, '0')})`;
  }

  // Parse timecode from 4 bytes
  parseTimecode(bytes) {
    if (bytes.length !== 4) return null;
    return {
      hours: bytes[0],
      minutes: bytes[1],
      seconds: bytes[2],
      frames: bytes[3]
    };
  }

  // Format timecode for display
  formatTimecode(timecode) {
    if (!timecode) return 'Unknown';
    const { hours, minutes, seconds, frames } = timecode;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${frames.toString().padStart(2, '0')}`;
  }

  // Add data to buffer
  addData(data) {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(data)]);
    return this.processBuffer();
  }

  // Process buffered data and extract commands
  processBuffer() {
    const results = [];

    while (this.buffer.length > 0) {
      const stxIndex = this.buffer.indexOf(this.STX);

      // If no STX found, treat remaining buffer as text
      if (stxIndex === -1) {
        if (this.buffer.length > 0) {
          const text = this.buffer.toString('ascii');

          // Emit text immediately instead of accumulating
          if (text.trim()) {
            const textData = {
              type: 'text',
              content: text,
              page: this.currentPage,
              line: this.currentLine,
              format: this.currentFormat,
              formatDescription: this.getFormatDescription(this.currentFormat),
              timecode: this.currentTimecode
            };

            results.push(textData);

            // If in refresh mode, also buffer this text
            if (this.refreshMode) {
              this.refreshBuffer.push({...textData});
            }
          }

          this.buffer = Buffer.alloc(0);
        }
        break;
      }

      // Process any text before the command
      if (stxIndex > 0) {
        const text = this.buffer.slice(0, stxIndex).toString('ascii');

        // Emit text immediately instead of accumulating
        if (text.trim()) {
          const textData = {
            type: 'text',
            content: text,
            page: this.currentPage,
            line: this.currentLine,
            format: this.currentFormat,
            formatDescription: this.getFormatDescription(this.currentFormat),
            timecode: this.currentTimecode
          };

          results.push(textData);

          // If in refresh mode, also buffer this text
          if (this.refreshMode) {
            this.refreshBuffer.push({...textData});
          }
        }

        this.buffer = this.buffer.slice(stxIndex);
      }

      // Check if we have enough data for a command
      if (this.buffer.length < 3) break; // Need at least STX + command + ETX

      const command = String.fromCharCode(this.buffer[1]);
      let commandLength = 3; // Default: STX + command + ETX
      let commandData = null;

      // Determine command length and extract data based on command type
      switch (command) {
        case 'P': // Page number (2 bytes)
          if (this.buffer.length < 5) return results; // STX + P + 2 bytes + ETX
          commandLength = 5;
          if (this.buffer[4] === this.ETX) {
            const pageNum = this.buffer.readUInt16LE(2);
            this.currentPage = pageNum;
            commandData = { pageNumber: pageNum };
          }
          break;

        case 'N': // Line number (1 byte)
          if (this.buffer.length < 4) return results; // STX + N + 1 byte + ETX
          commandLength = 4;
          if (this.buffer[3] === this.ETX) {
            const lineNum = this.buffer[2];
            this.currentLine = lineNum;
            commandData = { lineNumber: lineNum };
          }
          break;

        case 'F': // Format (1 byte)
          if (this.buffer.length < 4) return results;
          commandLength = 4;
          if (this.buffer[3] === this.ETX) {
            const format = this.buffer[2];

            // Just update the current format - no paragraph accumulation needed
            this.currentFormat = format;
            commandData = {
              format: format,
              formatDescription: this.getFormatDescription(format)
            };
          }
          break;

        case 'T': // Timecode (4 bytes)
          if (this.buffer.length < 7) return results; // STX + T + 4 bytes + ETX
          commandLength = 7;
          if (this.buffer[6] === this.ETX) {
            const timecodeBytes = this.buffer.slice(2, 6);
            const timecode = this.parseTimecode(timecodeBytes);
            this.currentTimecode = timecode; // Store current timecode for text association
            commandData = {
              timecode: timecode,
              timecodeString: this.formatTimecode(timecode)
            };
          }
          break;

        case 'D': // Delete (no data)
          if (this.buffer[2] === this.ETX) {
            commandData = { action: 'delete' };
          }
          break;

        case 'K': // Prevent saving (no data)
          if (this.buffer[2] === this.ETX) {
            commandData = { action: 'preventSaving' };
          }
          break;

        case 'E': // End refresh (no data)
          if (this.buffer[2] === this.ETX) {
            this.refreshMode = false;
            commandData = {
              action: 'endRefresh',
              refreshStart: this.refreshStart,
              refreshEnd: this.refreshEnd,
              refreshData: [...this.refreshBuffer]
            };
            this.refreshBuffer = [];
            this.refreshStart = null;
            this.refreshEnd = null;
          }
          break;

        case 'R': // Refresh (8 bytes: start and end timecodes)
          if (this.buffer.length < 11) return results; // STX + R + 8 bytes + ETX
          commandLength = 11;
          if (this.buffer[10] === this.ETX) {
            const startBytes = this.buffer.slice(2, 6);
            const endBytes = this.buffer.slice(6, 10);
            this.refreshStart = this.parseTimecode(startBytes);
            this.refreshEnd = this.parseTimecode(endBytes);
            this.refreshMode = true;
            this.refreshBuffer = [];
            commandData = {
              action: 'refresh',
              startTimecode: this.refreshStart,
              endTimecode: this.refreshEnd,
              startTimecodeString: this.formatTimecode(this.refreshStart),
              endTimecodeString: this.formatTimecode(this.refreshEnd)
            };
          }
          break;

        default:
          // Unknown command, skip this STX and continue
          this.buffer = this.buffer.slice(1);
          continue;
      }

      // If we couldn't parse the command properly, wait for more data
      if (commandData === null) {
        break;
      }

      // Add command to results
      results.push({
        type: 'command',
        command: command,
        data: commandData,
        page: this.currentPage,
        line: this.currentLine
      });

      // If in refresh mode, buffer the command for later processing
      if (this.refreshMode && command !== 'R' && command !== 'E') {
        this.refreshBuffer.push({
          type: 'command',
          command: command,
          data: commandData,
          page: this.currentPage,
          line: this.currentLine
        });
      }

      // Remove processed command from buffer
      this.buffer = this.buffer.slice(commandLength);
    }

    return results;
  }

  // Reset parser state
  reset() {
    this.buffer = Buffer.alloc(0);
    this.currentPage = 0;
    this.currentLine = 0;
    this.currentFormat = 0x00;
    this.currentTimecode = null;
    this.refreshMode = false;
    this.refreshStart = null;
    this.refreshEnd = null;
    this.refreshBuffer = [];
  }

  // Get current state
  getState() {
    return {
      currentPage: this.currentPage,
      currentLine: this.currentLine,
      currentFormat: this.currentFormat,
      currentFormatDescription: this.getFormatDescription(this.currentFormat),
      currentTimecode: this.currentTimecode,
      currentTimecodeString: this.formatTimecode(this.currentTimecode),
      refreshMode: this.refreshMode,
      bufferLength: this.buffer.length
    };
  }
}

module.exports = LawBridgeParser;