import { Router } from 'express';
import { SessionManager } from '../services/SessionManager';
import { WebSocketManager } from '../services/WebSocketManager';
import { CreateSessionRequest, AddStepRequest, UpdateStepRequest, ApiResponse } from '../types';
import { validateRequest } from '../middleware/validation';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';

export function sessionRoutes(sessionManager: SessionManager, wsManager: WebSocketManager): Router {
  const router = Router();

  // Create new test session
  router.post('/new', 
    validateRequest({
      body: {
        testName: { type: 'string', required: true, minLength: 1, maxLength: 255 },
        targetUrl: { type: 'string', required: true, pattern: /^https?:\/\/.+/ },
        settings: { type: 'object', required: false }
      }
    }),
    asyncHandler(async (req, res) => {
      const { testName, targetUrl, settings }: CreateSessionRequest = req.body;

      const session = await sessionManager.createSession(testName, targetUrl, settings);
      
      const response: ApiResponse = {
        success: true,
        data: {
          sessionId: session.id,
          testRunUrl: `${req.protocol}://${req.get('host')}/recording/${session.id}`,
          startTime: session.createdAt,
          session
        },
        message: 'Test session created successfully'
      };

      logger.info(`Created session: ${session.id} for test: ${testName}`);
      res.status(201).json(response);
    })
  );

  // Get session details
  router.get('/:sessionId', 
    asyncHandler(async (req, res) => {
      const { sessionId } = req.params;
      const session = await sessionManager.getSessionAsync(sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      const response: ApiResponse = {
        success: true,
        data: session
      };

      res.json(response);
    })
  );

  // Update session metadata
  router.put('/:sessionId',
    validateRequest({
      body: {
        testName: { type: 'string', required: false, minLength: 1, maxLength: 255 },
        targetUrl: { type: 'string', required: false, pattern: /^https?:\/\/.+/ }
      }
    }),
    asyncHandler(async (req, res) => {
      const { sessionId } = req.params;
      const updates = req.body;

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      // Update session properties
      if (updates.testName) session.testName = updates.testName;
      if (updates.targetUrl) session.targetUrl = updates.targetUrl;
      session.updatedAt = new Date().toISOString();

      const response: ApiResponse = {
        success: true,
        data: session,
        message: 'Session updated successfully'
      };

      res.json(response);
    })
  );

  // Start recording
  router.post('/:sessionId/start',
    asyncHandler(async (req, res) => {
      const { sessionId } = req.params;

      await sessionManager.startRecording(sessionId);
      
      // Notify connected clients
      wsManager.emitToSession(sessionId, 'recording:started', { 
        sessionId, 
        targetUrl: sessionManager.getSession(sessionId)?.targetUrl || '' 
      });

      const response: ApiResponse = {
        success: true,
        message: 'Recording started successfully'
      };

      res.json(response);
    })
  );

  // Pause recording
  router.post('/:sessionId/pause',
    asyncHandler(async (req, res) => {
      const { sessionId } = req.params;

      await sessionManager.pauseRecording(sessionId);
      
      wsManager.emitToSession(sessionId, 'recording:paused', { sessionId });

      const response: ApiResponse = {
        success: true,
        message: 'Recording paused successfully'
      };

      res.json(response);
    })
  );

  // Stop recording
  router.post('/:sessionId/stop',
    asyncHandler(async (req, res) => {
      const { sessionId } = req.params;

      await sessionManager.stopRecording(sessionId);
      
      wsManager.emitToSession(sessionId, 'recording:ended', { sessionId });

      const response: ApiResponse = {
        success: true,
        message: 'Recording stopped successfully'
      };

      res.json(response);
    })
  );

  // Add step to session
  router.post('/:sessionId/step',
    asyncHandler(async (req, res) => {
      const { sessionId } = req.params;
      const { stepData } = req.body;

      const step = await sessionManager.addStep(sessionId, stepData);
      
      // Notify connected clients
      wsManager.emitToSession(sessionId, 'step:recorded', { sessionId, step });

      const response: ApiResponse = {
        success: true,
        data: step,
        message: 'Step added successfully'
      };

      res.status(201).json(response);
    })
  );

  // Update step
  router.put('/:sessionId/step/:stepId',
    validateRequest({
      body: {
        selector: { type: 'string', required: false },
        actionParams: { type: 'object', required: false },
        description: { type: 'string', required: false, minLength: 1, maxLength: 500 }
      }
    }),
    asyncHandler(async (req, res) => {
      const { sessionId, stepId } = req.params;
      const updates: UpdateStepRequest = req.body;

      const step = await sessionManager.updateStep(sessionId, stepId, updates);
      
      // Notify connected clients
      wsManager.emitToSession(sessionId, 'step:updated', { sessionId, stepId, step });

      const response: ApiResponse = {
        success: true,
        data: step,
        message: 'Step updated successfully'
      };

      res.json(response);
    })
  );

  // Remove step
  router.delete('/:sessionId/step/:stepId',
    asyncHandler(async (req, res) => {
      const { sessionId, stepId } = req.params;

      await sessionManager.removeStep(sessionId, stepId);
      
      // Notify connected clients
      wsManager.emitToSession(sessionId, 'step:removed', { sessionId, stepId });

      const response: ApiResponse = {
        success: true,
        message: 'Step removed successfully'
      };

      res.json(response);
    })
  );

  // Get all steps for session
  router.get('/:sessionId/steps',
    asyncHandler(async (req, res) => {
      const { sessionId } = req.params;
      const session = sessionManager.getSession(sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      const response: ApiResponse = {
        success: true,
        data: session.steps
      };

      res.json(response);
    })
  );

  // Update session settings
  router.post('/:sessionId/settings',
    validateRequest({
      body: {
        healingStrategies: { type: 'array', required: false },
        confidenceThreshold: { type: 'number', required: false, min: 0, max: 1 },
        maxRetryAttempts: { type: 'number', required: false, min: 1, max: 10 },
        fallbackTimeout: { type: 'number', required: false, min: 1000, max: 60000 },
        screenshotMode: { type: 'string', required: false, enum: ['none', 'on-failure', 'always'] },
        waitTimeout: { type: 'number', required: false, min: 1000, max: 120000 },
        assertionStrictness: { type: 'string', required: false, enum: ['strict', 'loose'] }
      }
    }),
    asyncHandler(async (req, res) => {
      const { sessionId } = req.params;
      const settings = req.body;

      await sessionManager.updateSettings(sessionId, settings);
      
      // Notify connected clients
      wsManager.emitToSession(sessionId, 'settings:updated', { sessionId, settings });

      const response: ApiResponse = {
        success: true,
        message: 'Settings updated successfully'
      };

      res.json(response);
    })
  );

  // Delete session
  router.delete('/:sessionId',
    asyncHandler(async (req, res) => {
      const { sessionId } = req.params;

      await sessionManager.deleteSession(sessionId);

      const response: ApiResponse = {
        success: true,
        message: 'Session deleted successfully'
      };

      res.json(response);
    })
  );

  // Get all sessions
  router.get('/',
    asyncHandler(async (req, res) => {
      const sessions = sessionManager.getAllSessions();

      const response: ApiResponse = {
        success: true,
        data: sessions
      };

      res.json(response);
    })
  );

  return router;
}