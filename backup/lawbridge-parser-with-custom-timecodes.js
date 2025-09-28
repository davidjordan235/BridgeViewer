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

  // Add data to buffer and process immediately
  addData(data) {
    const results = [];

    // Process each byte immediately as it comes in
    for (let i = 0; i < data.length; i++) {
      const byte = data[i];

      if (byte === this.STX) {
        // Found start of command - add to buffer for command processing
        this.buffer = Buffer.concat([this.buffer, Buffer.from([byte])]);
      } else if (this.buffer.length > 0 && this.buffer[0] === this.STX) {
        // We're in the middle of a command - add to buffer
        this.buffer = Buffer.concat([this.buffer, Buffer.from([byte])]);

        // Try to process the command if we might have enough data
        const commandResults = this.tryProcessCommand();
        results.push(...commandResults);
      } else if (byte === 0xF9) { // ù character - start of non-standard timecode
        // Look ahead to see if we have a complete ù...ú sequence
        let timecodeEnd = -1;
        for (let j = i + 1; j < Math.min(i + 10, data.length); j++) {
          if (data[j] === 0xFA) { // ú character
            timecodeEnd = j;
            break;
          }
        }

        if (timecodeEnd > i + 1) {
          // Extract timecode data between ù and ú
          const timecodeBytes = data.slice(i + 1, timecodeEnd);

          // Check if this is hex ASCII or binary data
          if (timecodeBytes.length === 4) {
            // Convert ASCII hex to binary if needed
            let binaryTimecode;
            const timecodeStr = timecodeBytes.toString('ascii');

            // Check if it looks like hex ASCII (e.g., "4F56" or "5056")
            if (/^[0-9A-Fa-f]{4}$/.test(timecodeStr)) {
              // Parse as minutes:seconds format
              // First two hex digits = minutes, last two = seconds
              const minutes = parseInt(timecodeStr.substr(0, 2), 16);
              const seconds = parseInt(timecodeStr.substr(2, 2), 16);
              binaryTimecode = Buffer.from([
                0,         // Hours (not provided in this format)
                minutes,   // Minutes
                seconds,   // Seconds
                0          // Frames (not provided)
              ]);
            } else {
              // Use as raw binary
              binaryTimecode = timecodeBytes;
            }

            const timecode = this.parseTimecode(binaryTimecode);
            this.currentTimecode = timecode;
            this.currentLine++; // Increment line on new timecode

            // Emit timecode command
            results.push({
              type: 'command',
              command: 'T',
              data: {
                timecode: timecode,
                timecodeString: this.formatTimecode(timecode),
                rawData: timecodeStr
              },
              page: this.currentPage,
              line: this.currentLine
            });

            // Emit line number command to trigger new line/paragraph
            results.push({
              type: 'command',
              command: 'N',
              data: {
                lineNumber: this.currentLine
              },
              page: this.currentPage,
              line: this.currentLine
            });
          }

          // Skip past the entire timecode sequence
          i = timecodeEnd;
          continue;
        } else {
          // Not a complete timecode, treat as regular character
          const char = String.fromCharCode(byte);

          if (char && char.charCodeAt(0) >= 32 || char === '\r' || char === '\n' || char === '\t') {
            const textData = {
              type: 'text',
              content: char,
              page: this.currentPage,
              line: this.currentLine,
              format: this.currentFormat,
              formatDescription: this.getFormatDescription(this.currentFormat),
              timecode: this.currentTimecode
            };

            results.push(textData);

            if (this.refreshMode) {
              this.refreshBuffer.push({...textData});
            }
          }
        }
      } else {
        // Regular text character - emit immediately
        const char = String.fromCharCode(byte);

        if (char && char.charCodeAt(0) >= 32 || char === '\r' || char === '\n' || char === '\t') {
          // Emit this character immediately
          const textData = {
            type: 'text',
            content: char,
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
      }
    }

    return results;
  }

  // Try to process command from buffer
  tryProcessCommand() {
    if (this.buffer.length < 3) return []; // Need at least STX + command + ETX

    const commandResult = this.processCommand(0);
    if (commandResult.commandData && commandResult.bytesConsumed > 0) {
      // Remove the processed command from buffer
      this.buffer = this.buffer.slice(commandResult.bytesConsumed);

      return [{
        type: 'command',
        command: commandResult.command,
        data: commandResult.commandData,
        page: this.currentPage,
        line: this.currentLine
      }];
    }

    return [];
  }

  // Process buffered data and extract commands
  processBuffer() {
    const results = [];
    let textAccumulator = '';

    let i = 0;
    while (i < this.buffer.length) {
      // Check if we're at the start of a command (STX)
      if (this.buffer[i] === this.STX) {
        // Emit any accumulated text before processing the command
        if (textAccumulator) {
          const textData = {
            type: 'text',
            content: textAccumulator,
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

          textAccumulator = '';
        }

        // Process the command
        const commandResult = this.processCommand(i);
        if (commandResult.commandData) {
          results.push({
            type: 'command',
            command: commandResult.command,
            data: commandResult.commandData,
            page: this.currentPage,
            line: this.currentLine
          });

          // If in refresh mode, buffer the command for later processing
          if (this.refreshMode && commandResult.command !== 'R' && commandResult.command !== 'E') {
            this.refreshBuffer.push({
              type: 'command',
              command: commandResult.command,
              data: commandResult.commandData,
              page: this.currentPage,
              line: this.currentLine
            });
          }
        }

        if (commandResult.bytesConsumed > 0) {
          i += commandResult.bytesConsumed;
        } else {
          i++; // Skip this STX and continue
        }
      } else {
        // Regular character - add to text accumulator
        textAccumulator += String.fromCharCode(this.buffer[i]);
        i++;
      }
    }

    // Emit any remaining text
    if (textAccumulator) {
      const textData = {
        type: 'text',
        content: textAccumulator,
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

    // Clear the buffer as we've processed everything
    this.buffer = Buffer.alloc(0);

    return results;
  }

  // Process a single command starting at the given index
  processCommand(startIndex) {
    // Check if we have enough data for a command
    if (startIndex + 2 >= this.buffer.length) {
      return { command: null, commandData: null, bytesConsumed: 0 };
    }

    const command = String.fromCharCode(this.buffer[startIndex + 1]);
    let commandLength = 3; // Default: STX + command + ETX
    let commandData = null;

    // Determine command length and extract data based on command type
    switch (command) {
      case 'P': // Page number (2 bytes)
        if (startIndex + 4 >= this.buffer.length) return { command, commandData: null, bytesConsumed: 0 };
        commandLength = 5;
        if (this.buffer[startIndex + 4] === this.ETX) {
          const pageNum = this.buffer.readUInt16LE(startIndex + 2);
          this.currentPage = pageNum;
          commandData = { pageNumber: pageNum };
        }
        break;

      case 'N': // Line number (1 byte)
        if (startIndex + 3 >= this.buffer.length) return { command, commandData: null, bytesConsumed: 0 };
        commandLength = 4;
        if (this.buffer[startIndex + 3] === this.ETX) {
          const lineNum = this.buffer[startIndex + 2];
          this.currentLine = lineNum;
          commandData = { lineNumber: lineNum };
        }
        break;

      case 'F': // Format (1 byte)
        if (startIndex + 3 >= this.buffer.length) return { command, commandData: null, bytesConsumed: 0 };
        commandLength = 4;
        if (this.buffer[startIndex + 3] === this.ETX) {
          const format = this.buffer[startIndex + 2];
          this.currentFormat = format;
          commandData = {
            format: format,
            formatDescription: this.getFormatDescription(format)
          };
        }
        break;

      case 'T': // Timecode (4 bytes)
        if (startIndex + 6 >= this.buffer.length) return { command, commandData: null, bytesConsumed: 0 };
        commandLength = 7;
        if (this.buffer[startIndex + 6] === this.ETX) {
          const timecodeBytes = this.buffer.slice(startIndex + 2, startIndex + 6);
          const timecode = this.parseTimecode(timecodeBytes);
          this.currentTimecode = timecode;
          commandData = {
            timecode: timecode,
            timecodeString: this.formatTimecode(timecode)
          };
        }
        break;

      case 'D': // Delete (no data)
        if (this.buffer[startIndex + 2] === this.ETX) {
          commandData = { action: 'delete' };
        }
        break;

      case 'K': // Prevent saving (no data)
        if (this.buffer[startIndex + 2] === this.ETX) {
          commandData = { action: 'preventSaving' };
        }
        break;

      case 'E': // End refresh (no data)
        if (this.buffer[startIndex + 2] === this.ETX) {
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
        if (startIndex + 10 >= this.buffer.length) return { command, commandData: null, bytesConsumed: 0 };
        commandLength = 11;
        if (this.buffer[startIndex + 10] === this.ETX) {
          const startBytes = this.buffer.slice(startIndex + 2, startIndex + 6);
          const endBytes = this.buffer.slice(startIndex + 6, startIndex + 10);
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
        // Unknown command, return minimal consumption
        return { command, commandData: null, bytesConsumed: 1 };
    }

    return { command, commandData, bytesConsumed: commandLength };
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