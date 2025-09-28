class LawBridgeParser {
  constructor() {
    this.STX = 0x02; // Start of text
    this.ETX = 0x03; // End of text
    this.ALT_STX = 0xF9; // Alternative STX (ù character - 249)
    this.ALT_ETX = 0xFA; // Alternative ETX (ú character - 250)
    // UTF-8 encoded versions of ù and ú
    this.UTF8_STX = [0xC3, 0xB9]; // ù in UTF-8
    this.UTF8_ETX = [0xC3, 0xBA]; // ú in UTF-8
    this.buffer = Buffer.alloc(0);
    this.currentPage = 0;
    this.currentLine = 0;
    this.currentFormat = 0x00;
    this.currentTimecode = null; // Track current timecode for text association
    this.refreshMode = false;
    this.refreshStart = null;
    this.refreshEnd = null;
    this.refreshBuffer = [];
    this.speakerBuffer = ''; // Buffer for detecting speaker patterns
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

  // Helper method to check if bytes represent a UTF-8 start delimiter
  isUTF8StartDelimiter(buffer, index) {
    if (index + 1 >= buffer.length) return false;
    return buffer[index] === this.UTF8_STX[0] && buffer[index + 1] === this.UTF8_STX[1];
  }

  // Helper method to check if bytes represent a UTF-8 end delimiter
  isUTF8EndDelimiter(buffer, index) {
    if (index + 1 >= buffer.length) return false;
    return buffer[index] === this.UTF8_ETX[0] && buffer[index + 1] === this.UTF8_ETX[1];
  }

  // Helper method to check if byte is a start delimiter
  isStartDelimiter(byte) {
    return byte === this.STX || byte === this.ALT_STX;
  }

  // Helper method to check if byte is an end delimiter
  isEndDelimiter(byte) {
    return byte === this.ETX || byte === this.ALT_ETX;
  }

  // Preprocess data to remove timecode display sequences (ù....ú)
  preprocessData(data) {
    const processed = Buffer.alloc(data.length);
    let writeIndex = 0;

    for (let readIndex = 0; readIndex < data.length; readIndex++) {
      // Check for UTF-8 start delimiter (ù = 0xC3 0xB9)
      if (this.isUTF8StartDelimiter(data, readIndex)) {
        // Look for matching end delimiter
        let endIndex = -1;
        for (let searchIndex = readIndex + 2; searchIndex < data.length - 1; searchIndex++) {
          if (this.isUTF8EndDelimiter(data, searchIndex)) {
            endIndex = searchIndex + 1; // Include the end delimiter
            break;
          }
        }

        if (endIndex !== -1) {
          // Skip the entire timecode sequence (from ù to ú inclusive)
          readIndex = endIndex;
          continue;
        } else {
          // No matching end delimiter found, treat as regular character
          processed[writeIndex++] = data[readIndex];
        }
      }
      // Regular byte
      else {
        processed[writeIndex++] = data[readIndex];
      }
    }

    // Return only the portion we wrote to
    return processed.slice(0, writeIndex);
  }

  // Detect speaker patterns and emit format change commands
  detectSpeakerPatterns(char, results) {
    // Build up the speaker buffer
    this.speakerBuffer += char;

    // Keep only the last 10 characters to check for patterns
    if (this.speakerBuffer.length > 10) {
      this.speakerBuffer = this.speakerBuffer.slice(-10);
    }

    // Check for speaker pattern like "SP01:" at word boundaries
    const speakerMatch = this.speakerBuffer.match(/\s+(SP\d{2}:)\s*$/);
    if (speakerMatch) {
      // Found a speaker - emit a format change command to trigger paragraph break
      const formatCommand = {
        type: 'command',
        command: 'F',
        data: {
          format: 0x03, // Speaker format
          formatDescription: this.getFormatDescription(0x03)
        },
        page: this.currentPage,
        line: this.currentLine
      };

      results.push(formatCommand);
      this.currentFormat = 0x03; // Update current format to Speaker
      this.speakerBuffer = ''; // Reset buffer after detection
    }
  }

  // Add data to buffer and process immediately
  addData(data) {
    // First preprocess the data to handle UTF-8 delimiters
    const processedData = this.preprocessData(data);
    const results = [];

    // Process each byte immediately as it comes in
    for (let i = 0; i < processedData.length; i++) {
      const byte = processedData[i];

      if (this.isStartDelimiter(byte)) {
        // Found start of command - add to buffer for command processing
        this.buffer = Buffer.concat([this.buffer, Buffer.from([byte])]);
      } else if (this.buffer.length > 0 && this.isStartDelimiter(this.buffer[0])) {
        // We're in the middle of a command - add to buffer
        this.buffer = Buffer.concat([this.buffer, Buffer.from([byte])]);

        // Try to process the command if we might have enough data
        const commandResults = this.tryProcessCommand();
        results.push(...commandResults);
      } else {
        // Regular text character - emit immediately
        const char = String.fromCharCode(byte);

        if (char && char.charCodeAt(0) >= 32 || char === '\r' || char === '\n' || char === '\t') {
          // Check for speaker pattern (like "SP01:" or "SP02:") to trigger format changes
          this.detectSpeakerPatterns(char, results);

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
      if (this.isStartDelimiter(this.buffer[i])) {
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
        if (this.isEndDelimiter(this.buffer[startIndex + 4])) {
          const pageNum = this.buffer.readUInt16LE(startIndex + 2);
          this.currentPage = pageNum;
          commandData = { pageNumber: pageNum };
        }
        break;

      case 'N': // Line number (1 byte)
        if (startIndex + 3 >= this.buffer.length) return { command, commandData: null, bytesConsumed: 0 };
        commandLength = 4;
        if (this.isEndDelimiter(this.buffer[startIndex + 3])) {
          const lineNum = this.buffer[startIndex + 2];
          this.currentLine = lineNum;
          commandData = { lineNumber: lineNum };
        }
        break;

      case 'F': // Format (1 byte)
        if (startIndex + 3 >= this.buffer.length) return { command, commandData: null, bytesConsumed: 0 };
        commandLength = 4;
        if (this.isEndDelimiter(this.buffer[startIndex + 3])) {
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
        if (this.isEndDelimiter(this.buffer[startIndex + 6])) {
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
        if (this.isEndDelimiter(this.buffer[startIndex + 2])) {
          commandData = { action: 'delete' };
        }
        break;

      case 'K': // Prevent saving (no data)
        if (this.isEndDelimiter(this.buffer[startIndex + 2])) {
          commandData = { action: 'preventSaving' };
        }
        break;

      case 'E': // End refresh (no data)
        if (this.isEndDelimiter(this.buffer[startIndex + 2])) {
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
        if (this.isEndDelimiter(this.buffer[startIndex + 10])) {
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
    this.speakerBuffer = '';
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