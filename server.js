const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const net = require('net');
const path = require('path');
const LawBridgeParser = require('./lawbridge-parser');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store bridge data and sessions
const bridgeData = {
  sessions: new Map(),
  currentSession: null,
  documents: []
};

// LawBridge protocol parser instance
const parser = new LawBridgeParser();

// TCP server to receive LawBridge protocol data
const bridgeServer = net.createServer();
const BRIDGE_PORT = 8080;

bridgeServer.on('connection', (socket) => {
  console.log('LawBridge client connected');

  const sessionId = Date.now().toString();
  const session = {
    id: sessionId,
    startTime: new Date(),
    socket: socket,
    data: [],
    parser: new LawBridgeParser()
  };

  bridgeData.sessions.set(sessionId, session);
  bridgeData.currentSession = sessionId;

  // Notify web clients about new session
  io.emit('session:new', {
    sessionId: sessionId,
    startTime: session.startTime
  });

  socket.on('data', (data) => {
    console.log('Received data:', data.length, 'bytes');

    // Parse the incoming data
    const results = session.parser.addData(data);

    // Process each parsed result
    results.forEach(result => {
      // Add timestamp and session info
      result.timestamp = new Date();
      result.sessionId = sessionId;

      // Store in session data
      session.data.push(result);

      // Emit to web clients
      io.emit('bridge:data', result);

      console.log('Parsed:', result.type, result.type === 'command' ? result.command : 'text');
    });

    // Emit parser state
    io.emit('bridge:state', {
      sessionId: sessionId,
      state: session.parser.getState()
    });
  });

  socket.on('close', () => {
    console.log('LawBridge client disconnected');
    io.emit('session:end', { sessionId: sessionId });
  });

  socket.on('error', (err) => {
    console.error('LawBridge socket error:', err);
  });
});

// Web API routes
app.get('/api/sessions', (req, res) => {
  const sessions = Array.from(bridgeData.sessions.values()).map(session => ({
    id: session.id,
    startTime: session.startTime,
    dataCount: session.data.length,
    state: session.parser.getState()
  }));
  res.json(sessions);
});

app.get('/api/sessions/:sessionId', (req, res) => {
  const session = bridgeData.sessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    id: session.id,
    startTime: session.startTime,
    data: session.data,
    state: session.parser.getState()
  });
});

app.get('/api/sessions/:sessionId/data', (req, res) => {
  const session = bridgeData.sessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const { page, format, search, limit = 100, offset = 0 } = req.query;
  let data = session.data;

  // Filter by page
  if (page) {
    data = data.filter(item => item.page === parseInt(page));
  }

  // Filter by format
  if (format) {
    data = data.filter(item => item.format === parseInt(format, 16));
  }

  // Search in text content
  if (search) {
    const searchLower = search.toLowerCase();
    data = data.filter(item =>
      item.type === 'text' &&
      item.content.toLowerCase().includes(searchLower)
    );
  }

  // Pagination
  const total = data.length;
  data = data.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

  res.json({
    data: data,
    pagination: {
      total: total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    }
  });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Web client connected');

  // Send current session info
  if (bridgeData.currentSession) {
    const session = bridgeData.sessions.get(bridgeData.currentSession);
    socket.emit('session:current', {
      sessionId: session.id,
      startTime: session.startTime,
      state: session.parser.getState()
    });
  }

  socket.on('disconnect', () => {
    console.log('Web client disconnected');
  });

  // Handle client requests for session data
  socket.on('session:request', (sessionId) => {
    const session = bridgeData.sessions.get(sessionId);
    if (session) {
      socket.emit('session:data', {
        sessionId: sessionId,
        data: session.data,
        state: session.parser.getState()
      });
    }
  });
});

// Serve the web interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Test endpoint for sending sample data
app.post('/api/test/send-data', (req, res) => {
  const { data } = req.body;

  if (!data) {
    return res.status(400).json({ error: 'Data required' });
  }

  // Convert hex string to buffer if needed
  let buffer;
  if (typeof data === 'string') {
    // If it looks like hex data, parse it
    if (data.match(/^[0-9a-fA-F\s]+$/)) {
      const hexData = data.replace(/\s/g, '');
      buffer = Buffer.from(hexData, 'hex');
    } else {
      buffer = Buffer.from(data, 'ascii');
    }
  } else {
    buffer = Buffer.from(data);
  }

  // Process with parser
  const results = parser.addData(buffer);

  results.forEach(result => {
    result.timestamp = new Date();
    result.sessionId = 'test';
    io.emit('bridge:data', result);
  });

  res.json({
    success: true,
    results: results,
    state: parser.getState()
  });
});

// Start servers
const WEB_PORT = process.env.PORT || 3000;

bridgeServer.listen(BRIDGE_PORT, () => {
  console.log(`LawBridge TCP server listening on port ${BRIDGE_PORT}`);
});

server.listen(WEB_PORT, () => {
  console.log(`Web server listening on port ${WEB_PORT}`);
  console.log(`Web interface: http://localhost:${WEB_PORT}`);
  console.log(`LawBridge protocol server: TCP port ${BRIDGE_PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down servers...');
  bridgeServer.close();
  server.close();
  process.exit(0);
});