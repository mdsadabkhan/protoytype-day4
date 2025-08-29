import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';

import { sessionRoutes } from './routes/sessionRoutes';
import { testRoutes } from './routes/testRoutes';
import { exportRoutes } from './routes/exportRoutes';
import { WebSocketManager } from './services/WebSocketManager';
import { BrowserManager } from './services/BrowserManager';
import { SessionManager } from './services/SessionManager';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { validateRequest } from './middleware/validation';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env['FRONTEND_URL'] || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Initialize managers
const browserManager = new BrowserManager();
const sessionManager = new SessionManager(browserManager);
const wsManager = new WebSocketManager(io, sessionManager);

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  })
);

app.use(compression());
app.use(
  morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

app.use(
  cors({
    origin: process.env['FRONTEND_URL'] || 'http://localhost:5173',
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    activeSessions: sessionManager.getActiveSessionCount(),
  });
});

// API Routes
app.use('/api/session', sessionRoutes(sessionManager, wsManager));
app.use('/api/test', testRoutes(sessionManager));
app.use('/api/export', exportRoutes(sessionManager));

// Serve built recording UI
const recordingPath = path.join(__dirname, '../public/recording');
app.use('/recording', express.static(recordingPath, { index: 'index.html' }));
// Fallback to index.html for client-side routing under /recording/*
app.get('/recording/*', (req, res) => {
  res.sendFile(path.join(recordingPath, 'index.html'));
});

// Error handling
app.use(errorHandler);

// 404 handler for all other routes
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await browserManager.closeAll();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await browserManager.closeAll();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

const PORT = process.env['PORT'] || 3001;

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(
    `Frontend URL: ${process.env['FRONTEND_URL'] || 'http://localhost:5173'}`
  );
});

export { app, server, io };
