class LawBridgeParser {
  constructor() {
    this.STX = 0x02; // Start of text
    this.ETX = 0x03; // End of text
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

      if (byte === this.STX && i + 1 < data.length) {
        // Found start of command - check if we can process it
        const commandByte = data[i + 1];
        const commandChar = String.fromCharCode(commandByte);

        // Determine expected command length based on command type
        let expectedLength = this.getCommandLength(commandChar);

        if (expectedLength > 0 && i + expectedLength <= data.length) {
          // We have enough data to process this command
          const commandData = this.parseCommand(commandChar, data, i);

          if (commandData) {
            // Handle state updates
            this.updateState(commandChar, commandData);

            results.push({
              type: 'command',
              command: commandChar,
              data: commandData,
              page: this.currentPage,
              line: this.currentLine
            });

            // If in refresh mode, buffer non-control commands
            if (this.refreshMode && commandChar !== 'R' && commandChar !== 'E') {
              this.refreshBuffer.push({
                type: 'command',
                command: commandChar,
                data: commandData,
                page: this.currentPage,
                line: this.currentLine
              });
            }
          }

          // Skip past the command bytes
          i += expectedLength - 1; // -1 because loop will increment
        } else {
          // Not enough data yet, add to buffer for later processing
          this.buffer = Buffer.concat([this.buffer, Buffer.from([byte])]);
        }
      } else if (this.buffer.length > 0) {
        // We have buffered data, add this byte
        this.buffer = Buffer.concat([this.buffer, Buffer.from([byte])]);

        // Try to process buffered commands
        const bufferedResults = this.processBufferedCommands();
        results.push(...bufferedResults);
      } else {
        // Regular text character - emit immediately
        const char = String.fromCharCode(byte);

        if (char && byte >= 32 || byte === 0x0D || byte === 0x0A || byte === 0x09) {
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

  // Get expected command length including STX and ETX
  getCommandLength(commandChar) {
    switch (commandChar) {
      case 'P': return 5; // STX + P + 2 bytes + ETX
      case 'N': return 4; // STX + N + 1 byte + ETX
      case 'F': return 4; // STX + F + 1 byte + ETX
      case 'T': return 7; // STX + T + 4 bytes + ETX
      case 'D': return 3; // STX + D + ETX
      case 'K': return 3; // STX + K + ETX
      case 'E': return 3; // STX + E + ETX
      case 'R': return 11; // STX + R + 8 bytes + ETX
      default: return 0; // Unknown command
    }
  }

  // Parse a specific command from the data
  parseCommand(commandChar, data, startIndex) {
    const expectedLength = this.getCommandLength(commandChar);

    // Verify we have STX at start and ETX at end
    if (data[startIndex] !== this.STX || data[startIndex + expectedLength - 1] !== this.ETX) {
      return null;
    }

    switch (commandChar) {
      case 'P': // Page number (2 bytes, little-endian)
        const pageNum = data.readUInt16LE(startIndex + 2);
        return { pageNumber: pageNum };

      case 'N': // Line number (1 byte)
        const lineNum = data[startIndex + 2];
        return { lineNumber: lineNum };

      case 'F': // Format (1 byte)
        const format = data[startIndex + 2];
        return {
          format: format,
          formatDescription: this.getFormatDescription(format)
        };

      case 'T': // Timecode (4 bytes)
        const timecodeBytes = data.slice(startIndex + 2, startIndex + 6);
        const timecode = this.parseTimecode(timecodeBytes);
        return {
          timecode: timecode,
          timecodeString: this.formatTimecode(timecode)
        };

      case 'D': // Delete
        return { action: 'delete' };

      case 'K': // Prevent saving
        return { action: 'preventSaving' };

      case 'E': // End refresh
        const endData = {
          action: 'endRefresh',
          refreshStart: this.refreshStart,
          refreshEnd: this.refreshEnd,
          refreshData: [...this.refreshBuffer]
        };
        return endData;

      case 'R': // Refresh (8 bytes: start and end timecodes)
        const startBytes = data.slice(startIndex + 2, startIndex + 6);
        const endBytes = data.slice(startIndex + 6, startIndex + 10);
        const refreshStart = this.parseTimecode(startBytes);
        const refreshEnd = this.parseTimecode(endBytes);
        return {
          action: 'refresh',
          startTimecode: refreshStart,
          endTimecode: refreshEnd,
          startTimecodeString: this.formatTimecode(refreshStart),
          endTimecodeString: this.formatTimecode(refreshEnd)
        };

      default:
        return null;
    }
  }

  // Update parser state based on command
  updateState(commandChar, commandData) {
    switch (commandChar) {
      case 'P':
        this.currentPage = commandData.pageNumber;
        break;
      case 'N':
        this.currentLine = commandData.lineNumber;
        break;
      case 'F':
        this.currentFormat = commandData.format;
        break;
      case 'T':
        this.currentTimecode = commandData.timecode;
        break;
      case 'R':
        this.refreshMode = true;
        this.refreshStart = commandData.startTimecode;
        this.refreshEnd = commandData.endTimecode;
        this.refreshBuffer = [];
        break;
      case 'E':
        this.refreshMode = false;
        this.refreshStart = null;
        this.refreshEnd = null;
        this.refreshBuffer = [];
        break;
    }
  }

  // Process any buffered commands
  processBufferedCommands() {
    const results = [];

    if (this.buffer.length < 3) return results;

    let i = 0;
    while (i < this.buffer.length) {
      if (this.buffer[i] === this.STX && i + 1 < this.buffer.length) {
        const commandChar = String.fromCharCode(this.buffer[i + 1]);
        const expectedLength = this.getCommandLength(commandChar);

        if (expectedLength > 0 && i + expectedLength <= this.buffer.length) {
          // Process this command
          const commandData = this.parseCommand(commandChar, this.buffer, i);

          if (commandData) {
            this.updateState(commandChar, commandData);

            results.push({
              type: 'command',
              command: commandChar,
              data: commandData,
              page: this.currentPage,
              line: this.currentLine
            });

            if (this.refreshMode && commandChar !== 'R' && commandChar !== 'E') {
              this.refreshBuffer.push({
                type: 'command',
                command: commandChar,
                data: commandData,
                page: this.currentPage,
                line: this.currentLine
              });
            }
          }

          i += expectedLength;
        } else {
          // Not enough data for this command, stop processing
          break;
        }
      } else {
        // Text character
        const char = String.fromCharCode(this.buffer[i]);
        if (this.buffer[i] >= 32 || this.buffer[i] === 0x0D || this.buffer[i] === 0x0A || this.buffer[i] === 0x09) {
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
        i++;
      }
    }

    // Remove processed data from buffer
    if (i > 0) {
      this.buffer = this.buffer.slice(i);
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