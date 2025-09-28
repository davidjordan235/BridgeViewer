# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bridge Viewer is a Node.js web application that receives and displays LawBridge protocol data from Eclipse court reporting software. The application consists of a TCP server that receives binary protocol data, a WebSocket server for real-time web communication, and a web-based viewer interface.

## Development Commands

### Basic Operations
- `npm start` - Start the production server
- `npm run dev` - Start development server with auto-restart (nodemon)
- `npm install` - Install dependencies

### Testing
- Use `test-client.js` to send sample LawBridge protocol data
- Web interface includes built-in test data functionality
- Use POST `/api/test/send-data` endpoint to send hex test data

## Architecture Overview

### Core Components

1. **server.js** - Main application server
   - Express web server (port 3000)
   - TCP server for LawBridge protocol (port 8080)
   - WebSocket server for real-time communication
   - Session management and data storage
   - RESTful API endpoints

2. **lawbridge-parser.js** - LawBridge protocol parser
   - Handles binary protocol parsing
   - Supports all LawBridge commands (P, N, F, T, D, K, R, E)
   - Real-time character-by-character processing
   - Maintains parser state (page, line, format, timecode)
   - Handles refresh mode for Eclipse refresh operations

3. **public/** - Frontend web interface
   - `index.html` - Main web interface
   - `app.js` - Client-side JavaScript
   - `style.css` - Styling

### Data Flow
1. Eclipse sends binary LawBridge protocol data to TCP port 8080
2. `server.js` receives data and uses `LawBridgeParser` to parse commands and text
3. Parsed data is stored in memory sessions and broadcast via WebSocket
4. Web interface displays real-time transcript data with formatting

### Protocol Support
The application implements the complete LawBridge protocol:
- **P**: Page number (2 bytes, little-endian)
- **N**: Line number (1 byte)
- **F**: Format type (1 byte) - 13+ format types supported
- **T**: Timecode (4 bytes: hours, minutes, seconds, frames)
- **D**: Delete/backspace
- **K**: Prevent saving
- **R**: Refresh with start/end timecodes (8 bytes)
- **E**: End refresh

### Key Features
- **Real-time Processing**: Character-by-character parsing for immediate display
- **Session Management**: Multiple bridge sessions with timestamps
- **Format Support**: All LawBridge format types (Question, Answer, Speaker, etc.)
- **Search & Filtering**: API endpoints for filtering by page, format, and text content
- **Refresh Mode**: Handles Eclipse refresh operations with buffered data replay

### Memory Storage
- Sessions stored in `Map` objects in memory
- Each session contains parser state, data array, and socket reference
- No persistent storage - data is lost on server restart

### API Endpoints
- `GET /api/sessions` - List all sessions
- `GET /api/sessions/:sessionId` - Get session details
- `GET /api/sessions/:sessionId/data` - Get filtered session data
- `POST /api/test/send-data` - Send test protocol data

### Network Configuration
- Web server: Port 3000 (configurable via PORT env var)
- LawBridge TCP server: Port 8080 (hardcoded)
- WebSocket: Same port as web server

## Important Implementation Details

### Parser Design
The `LawBridgeParser` processes data immediately as it arrives, emitting characters individually for real-time display. Commands are buffered until complete, then processed atomically. This design ensures Eclipse-accurate line breaks and immediate text display.

### Session Handling
Each TCP connection creates a new session with its own parser instance. Sessions persist until the TCP connection closes. The web interface can view any session's data through the API.

### Testing Strategy
Use the built-in test interface or `test-client.js` for protocol testing. The test endpoint accepts both hex strings and ASCII data, making it easy to simulate Eclipse protocol sequences.