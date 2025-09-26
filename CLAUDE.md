# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Essential Commands
- `npm start` - Start production server (Node.js + TCP bridge server)
- `npm run dev` - Start development server with auto-restart (uses nodemon)
- `npm install` - Install all dependencies

### Server Ports
- **Web Interface**: http://localhost:3000 (configurable via PORT env var)
- **Bridge Protocol**: TCP port 8080 (receives Eclipse LawBridge protocol data)

### Testing
- Use the built-in web UI test interface at `/` under "Test Data" section
- Send test protocol data via POST to `/api/test/send-data`
- Example test files: `test-protocol.js`, `test-client.js`

## Architecture Overview

This is a real-time LawBridge protocol viewer that receives binary protocol data from Eclipse CAT software and displays parsed transcript data in a web interface.

### Core Components

**Server Layer** (`server.js`):
- Express.js web server serving static files from `public/`
- Socket.io WebSocket server for real-time client communication
- TCP server on port 8080 receiving LawBridge protocol data
- Session management with in-memory storage
- REST API endpoints for session data access

**Protocol Parser** (`lawbridge-parser.js`):
- Handles all LawBridge protocol commands (P/N/F/T/D/K/R/E)
- Binary data parsing with STX/ETX framing (0x02/0x03)
- Command-specific data extraction (pages, lines, formats, timecodes)
- Refresh mode buffering for Eclipse's refresh operations
- Real-time streaming data processing

**Web Client** (`public/app.js`):
- `BridgeViewer` class manages entire frontend application
- Real-time WebSocket data reception and display
- Text accumulator system for Eclipse-accurate line breaks
- Format-driven paragraph creation (F commands trigger new paragraphs)
- Three-panel tabbed interface (Words/Annotations/Keywords)
- Word index with alphabetical organization and search
- User annotation and keyword management system
- Font customization and color theming
- Search/filter functionality across transcript data

### Critical Data Flow

1. **Eclipse → TCP Server**: Binary LawBridge protocol data received on port 8080
2. **Parser Processing**: Each session gets dedicated parser instance, commands processed immediately
3. **WebSocket Broadcast**: Parsed data streamed to connected web clients in real-time
4. **Client Text Assembly**:
   - Characters accumulated in `textAccumulator`
   - Format (F) commands trigger paragraph finalization and new paragraph start
   - Line (N) commands update state but don't create line breaks
   - Real-time display shows partial text as it accumulates

### LawBridge Protocol Specifics

**Command Types**:
- P: Page number (2 bytes LE)
- N: Line number (1 byte)
- F: Format code (1 byte) - **CRITICAL**: Indicates paragraph breaks in Eclipse
- T: Timecode (4 bytes: hours/minutes/seconds/frames)
- D: Delete/backspace operation
- K: Prevent saving flag
- R: Refresh start (8 bytes: start+end timecodes)
- E: Refresh end

**Format Codes** (F command):
- 0x00: Fixed line, 0x01: Question, 0x02: Answer, 0x03: Speaker
- 0x04-0x06: Continuation formats
- 0x07: Parenthetical, 0x08: Centered, 0x09: Right-flush
- 0x0A-0x0B: By line formats
- 0x0C+: User-defined formats

### UI Architecture

**Three-Panel Layout**:
- **Left Sidebar**: Controls, filters, search, color/font options, test data interface
- **Center Panel**: Real-time transcript display with format-based styling
- **Right Panel**: Tabbed index (Words/Annotations/Keywords) with search and management

**State Management**:
- Word index: `Map` of word → location arrays
- Annotations: Array of user notes with positional data
- Keywords: `Map` of keyword → location arrays
- Colors/fonts: localStorage persistence with CSS custom properties
- Real-time text: `textAccumulator` + `currentParagraphFormat` tracking

### Key Implementation Details

**Text Processing**:
- Eclipse uses F commands for paragraph breaks, NOT CR/LF characters
- `handleRealTimeText()` accumulates characters, `handleFormatChange()` finalizes paragraphs
- Word index built during text finalization, not real-time display
- Speaker detection applies consistent color theming to all speaker labels

**WebSocket Events**:
- `bridgeData`: New protocol data received
- `sessionUpdate`: Session information changes
- Server broadcasts immediately upon TCP data reception

**Data Persistence**:
- Sessions: In-memory Map with session IDs and parser instances
- User settings: localStorage (colors, fonts, annotations, keywords)
- No database - all protocol data stored in memory per session

## File Organization

- `server.js`: Main server, TCP bridge, WebSocket, API endpoints
- `lawbridge-parser.js`: Protocol parsing logic and command handling
- `public/app.js`: Frontend application class and all UI logic
- `public/index.html`: Single-page application structure
- `public/style.css`: Complete styling including responsive design
- `test-*.js`: Development testing utilities
- `backup/`: Development backups and alternate implementations