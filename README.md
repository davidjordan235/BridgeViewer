# Bridge Viewer - LawBridge Protocol Webserver

A web-based application for viewing and managing data from Eclipse's LawBridge protocol in real-time.

## Features

- **Real-time Protocol Parsing**: Handles all LawBridge commands (P, N, F, T, D, K, R, E)
- **Web Interface**: Modern, responsive web UI for viewing transcript data
- **WebSocket Support**: Real-time data streaming to connected web clients
- **Search & Filtering**: Filter by page, format type, and search text content
- **Session Management**: Track multiple bridge sessions
- **Test Interface**: Send test data to verify protocol parsing

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

## Usage

1. **Start the server**: Run `npm start`
2. **Open web interface**: Navigate to `http://localhost:3000`
3. **Connect Eclipse Bridge**: Configure Eclipse to send data to TCP port `8080` on this machine
4. **View real-time data**: The web interface will display parsed protocol data as it arrives

## Protocol Support

The application fully supports the LawBridge protocol specification:

### Supported Commands

- **P** - Page number (2 bytes, little-endian)
- **N** - Line number (1 byte)
- **F** - Format type (1 byte) - Supports all 12+ format types
- **T** - Timecode (4 bytes: hours, minutes, seconds, frames)
- **D** - Delete/backspace
- **K** - Prevent saving
- **R** - Refresh with start/end timecodes (8 bytes)
- **E** - End refresh

### Format Types Supported

- 0x00: Fixed line
- 0x01: Question
- 0x02: Answer
- 0x03: Speaker
- 0x04: Question continuation
- 0x05: Answer continuation
- 0x06: Speaker continuation
- 0x07: Parenthetical
- 0x08: Centered
- 0x09: Right-flush
- 0x0A: By line
- 0x0B: By line continuation
- 0x0C+: User-defined

## API Endpoints

- `GET /api/sessions` - List all sessions
- `GET /api/sessions/:sessionId` - Get session data
- `GET /api/sessions/:sessionId/data` - Get filtered session data
- `POST /api/test/send-data` - Send test protocol data

## Testing

Use the built-in test interface in the web UI to send sample protocol data:

1. Click "Test Data" section in the sidebar
2. Enter hex data or use example buttons
3. Click "Send Test Data"

## Architecture

- **Node.js/Express** - Web server and API
- **Socket.io** - Real-time WebSocket communication
- **TCP Server** - Receives LawBridge protocol data on port 8080
- **Protocol Parser** - Handles binary protocol parsing and command extraction
- **Web Interface** - Modern HTML5/CSS3/JavaScript frontend

## Configuration

- **Web Port**: 3000 (configurable via PORT environment variable)
- **Bridge Protocol Port**: 8080 (TCP)
- **Data Storage**: In-memory (sessions and data)