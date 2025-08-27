import { Server as SocketIOServer, Socket } from 'socket.io';
import { SessionManager } from './SessionManager';
import { WebSocketEvents } from '../types';
import { logger } from '../utils/logger';

export class WebSocketManager {
  private connectedClients: Map<string, Socket> = new Map();
  private sessionConnections: Map<string, Set<string>> = new Map();

  constructor(
    private io: SocketIOServer,
    private sessionManager: SessionManager
  ) {
    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Client connected: ${socket.id}`);
      this.connectedClients.set(socket.id, socket);

      // Join session room
      socket.on('join-session', (sessionId: string) => {
        socket.join(sessionId);
        
        // Track session connections
        if (!this.sessionConnections.has(sessionId)) {
          this.sessionConnections.set(sessionId, new Set());
        }
        this.sessionConnections.get(sessionId)!.add(socket.id);

        logger.info(`Client ${socket.id} joined session: ${sessionId}`);
      });

      // Leave session room
      socket.on('leave-session', (sessionId: string) => {
        socket.leave(sessionId);
        
        const connections = this.sessionConnections.get(sessionId);
        if (connections) {
          connections.delete(socket.id);
          if (connections.size === 0) {
            this.sessionConnections.delete(sessionId);
          }
        }

        logger.info(`Client ${socket.id} left session: ${sessionId}`);
      });

      // Handle recording actions
      socket.on('recording:start', async (data: { sessionId: string }) => {
        try {
          await this.sessionManager.startRecording(data.sessionId);
          this.emitToSession(data.sessionId, 'recording:started', { sessionId: data.sessionId });
        } catch (error) {
          socket.emit('session:error', { 
            sessionId: data.sessionId, 
            error: (error as Error).message 
          });
        }
      });

      socket.on('recording:pause', async (data: { sessionId: string }) => {
        try {
          await this.sessionManager.pauseRecording(data.sessionId);
          this.emitToSession(data.sessionId, 'recording:paused', { sessionId: data.sessionId });
        } catch (error) {
          socket.emit('session:error', { 
            sessionId: data.sessionId, 
            error: (error as Error).message 
          });
        }
      });

      socket.on('recording:stop', async (data: { sessionId: string }) => {
        try {
          await this.sessionManager.stopRecording(data.sessionId);
          this.emitToSession(data.sessionId, 'recording:ended', { sessionId: data.sessionId });
        } catch (error) {
          socket.emit('session:error', { 
            sessionId: data.sessionId, 
            error: (error as Error).message 
          });
        }
      });

      // Handle step actions
      socket.on('step:add', async (data: { sessionId: string; stepData: any }) => {
        try {
          const step = await this.sessionManager.addStep(data.sessionId, data.stepData);
          this.emitToSession(data.sessionId, 'step:recorded', { 
            sessionId: data.sessionId, 
            step 
          });
        } catch (error) {
          socket.emit('session:error', { 
            sessionId: data.sessionId, 
            error: (error as Error).message 
          });
        }
      });

      socket.on('step:update', async (data: { sessionId: string; stepId: string; updates: any }) => {
        try {
          const step = await this.sessionManager.updateStep(data.sessionId, data.stepId, data.updates);
          this.emitToSession(data.sessionId, 'step:updated', { 
            sessionId: data.sessionId, 
            stepId: data.stepId, 
            step 
          });
        } catch (error) {
          socket.emit('session:error', { 
            sessionId: data.sessionId, 
            error: (error as Error).message 
          });
        }
      });

      socket.on('step:remove', async (data: { sessionId: string; stepId: string }) => {
        try {
          await this.sessionManager.removeStep(data.sessionId, data.stepId);
          this.emitToSession(data.sessionId, 'step:removed', { 
            sessionId: data.sessionId, 
            stepId: data.stepId 
          });
        } catch (error) {
          socket.emit('session:error', { 
            sessionId: data.sessionId, 
            error: (error as Error).message 
          });
        }
      });

      // Handle browser actions
      socket.on('browser:action', async (data: { sessionId: string; action: any }) => {
        try {
          await this.handleBrowserAction(data.sessionId, data.action);
          this.emitToSession(data.sessionId, 'browser:action', data);
        } catch (error) {
          socket.emit('session:error', { 
            sessionId: data.sessionId, 
            error: (error as Error).message 
          });
        }
      });

      // Handle settings updates
      socket.on('settings:update', async (data: { sessionId: string; settings: any }) => {
        try {
          await this.sessionManager.updateSettings(data.sessionId, data.settings);
          this.emitToSession(data.sessionId, 'settings:updated', { 
            sessionId: data.sessionId, 
            settings: data.settings 
          });
        } catch (error) {
          socket.emit('session:error', { 
            sessionId: data.sessionId, 
            error: (error as Error).message 
          });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
        this.connectedClients.delete(socket.id);

        // Clean up session connections
        for (const [sessionId, connections] of this.sessionConnections.entries()) {
          connections.delete(socket.id);
          if (connections.size === 0) {
            this.sessionConnections.delete(sessionId);
          }
        }
      });

      // Send initial connection confirmation
      socket.emit('connected', { socketId: socket.id });
    });
  }

  private async handleBrowserAction(sessionId: string, action: any): Promise<void> {
    // This method handles browser automation actions triggered from the frontend
    // Implementation depends on the specific action type
    logger.info(`Handling browser action for session ${sessionId}:`, action);
  }

  emitToSession<K extends keyof WebSocketEvents>(
    sessionId: string, 
    event: K, 
    data: WebSocketEvents[K]
  ): void {
    this.io.to(sessionId).emit(event, data);
    logger.debug(`Emitted ${event} to session ${sessionId}`);
  }

  emitToClient<K extends keyof WebSocketEvents>(
    socketId: string, 
    event: K, 
    data: WebSocketEvents[K]
  ): void {
    const socket = this.connectedClients.get(socketId);
    if (socket) {
      socket.emit(event, data);
      logger.debug(`Emitted ${event} to client ${socketId}`);
    }
  }

  getConnectedClients(): number {
    return this.connectedClients.size;
  }

  getSessionConnections(sessionId: string): number {
    return this.sessionConnections.get(sessionId)?.size || 0;
  }
}