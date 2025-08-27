import { v4 as uuidv4 } from 'uuid';
import { TestSession, TestStep, SessionSettings, HealingStrategy } from '../types';
import { BrowserManager } from './BrowserManager';
import { DatabaseService } from './DatabaseService';
import { logger } from '../utils/logger';
import { PlaywrightCodeGenerator } from '../utils/PlaywrightCodeGenerator';
import { SelfHealingEngine } from '../utils/SelfHealingEngine';

export class SessionManager {
  private activeSessions: Map<string, TestSession> = new Map();
  private db = new DatabaseService();
  private codeGenerator = new PlaywrightCodeGenerator();
  private healingEngine = new SelfHealingEngine();

  constructor(private browserManager: BrowserManager) {}

  async createSession(testName: string, targetUrl: string, settings?: Partial<SessionSettings>): Promise<TestSession> {
    const sessionId = uuidv4();
    
    const defaultSettings: SessionSettings = {
      healingStrategies: [
        HealingStrategy.ATTRIBUTE_MATCHING,
        HealingStrategy.TEXT_CONTENT_MATCHING,
        HealingStrategy.POSITIONAL_MATCHING
      ],
      confidenceThreshold: 0.8,
      maxRetryAttempts: 3,
      fallbackTimeout: 5000,
      screenshotMode: 'on-failure',
      waitTimeout: 30000,
      assertionStrictness: 'loose'
    };

    const session: TestSession = {
      id: sessionId,
      testName,
      targetUrl,
      steps: [],
      status: 'created',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: { ...defaultSettings, ...settings },
      metadata: {
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        browser: 'chromium'
      }
    };

    // Create browser session
    await this.browserManager.createSession(sessionId);

    // Store in memory and database
    this.activeSessions.set(sessionId, session);
    await this.db.createSession(session);

    logger.info(`Created test session: ${sessionId} - ${testName}`);
    return session;
  }

  async startRecording(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const browserSession = this.browserManager.getSession(sessionId);
    if (!browserSession) {
      throw new Error(`Browser session not found: ${sessionId}`);
    }

    // Navigate to target URL
    await browserSession.page.goto(session.targetUrl);

    // Start recording
    browserSession.isRecording = true;
    session.status = 'recording';
    session.updatedAt = new Date().toISOString();

    // Set up event listeners for recording
    await this.setupRecordingListeners(sessionId, browserSession.page);

    // Update in storage
    this.activeSessions.set(sessionId, session);
    await this.db.updateSession(sessionId, { status: 'recording', updatedAt: session.updatedAt });

    logger.info(`Started recording for session: ${sessionId}`);
  }

  private async setupRecordingListeners(sessionId: string, page: any): Promise<void> {
    // Listen for navigation events
    page.on('framenavigated', async (frame: any) => {
      if (frame === page.mainFrame()) {
        await this.addStep(sessionId, {
          type: 'navigate',
          selector: '',
          actionParams: { url: frame.url() },
          description: `Navigate to ${frame.url()}`
        });
      }
    });

    // Inject client-side recording script
    await page.addInitScript(() => {
      // Client-side event capture
      const recordEvent = (eventType: string, element: Element, value?: string) => {
        const selector = generateSelector(element);
        window.postMessage({
          type: 'PLAYWRIGHT_RECORD',
          eventType,
          selector,
          value,
          timestamp: Date.now()
        }, '*');
      };

      const generateSelector = (element: Element): string => {
        // Priority: data-testid > aria-label > id > class > tag
        if (element.getAttribute('data-testid')) {
          return `[data-testid="${element.getAttribute('data-testid')}"]`;
        }
        if (element.getAttribute('aria-label')) {
          return `[aria-label="${element.getAttribute('aria-label')}"]`;
        }
        if (element.id) {
          return `#${element.id}`;
        }
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.length > 0);
          if (classes.length > 0) {
            return `.${classes[0]}`;
          }
        }
        return element.tagName.toLowerCase();
      };

      // Record clicks
      document.addEventListener('click', (e) => {
        recordEvent('click', e.target as Element);
      }, true);

      // Record input changes
      document.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        recordEvent('fill', target, target.value);
      }, true);

      // Record form submissions
      document.addEventListener('submit', (e) => {
        recordEvent('submit', e.target as Element);
      }, true);
    });

    // Listen for recorded events from client
    page.on('console', async (msg: any) => {
      if (msg.type() === 'log' && msg.text().startsWith('PLAYWRIGHT_RECORD:')) {
        try {
          const eventData = JSON.parse(msg.text().replace('PLAYWRIGHT_RECORD:', ''));
          await this.handleRecordedEvent(sessionId, eventData);
        } catch (error) {
          logger.error(`Error parsing recorded event: ${error}`);
        }
      }
    });
  }

  private async handleRecordedEvent(sessionId: string, eventData: any): Promise<void> {
    const { eventType, selector, value } = eventData;

    let stepType: TestStep['type'];
    let description: string;
    let actionParams: any = {};

    switch (eventType) {
      case 'click':
        stepType = 'click';
        description = `Click on ${selector}`;
        break;
      case 'fill':
        stepType = 'fill';
        description = `Fill "${value}" in ${selector}`;
        actionParams = { value };
        break;
      case 'submit':
        stepType = 'click';
        description = `Submit form ${selector}`;
        break;
      default:
        return;
    }

    await this.addStep(sessionId, {
      type: stepType,
      selector,
      actionParams,
      description
    });
  }

  async addStep(sessionId: string, stepData: Omit<TestStep, 'id' | 'timestamp' | 'fallbackSelectors'>): Promise<TestStep> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Generate fallback selectors using self-healing engine
    const fallbackSelectors = await this.healingEngine.generateFallbackSelectors(
      stepData.selector,
      stepData.type,
      session.settings.healingStrategies
    );

    const step: TestStep = {
      id: uuidv4(),
      ...stepData,
      timestamp: new Date().toISOString(),
      fallbackSelectors
    };

    // Add to session
    session.steps.push(step);
    session.updatedAt = new Date().toISOString();

    // Update storage
    this.activeSessions.set(sessionId, session);
    await this.db.addStep(sessionId, step, session.steps.length - 1);

    logger.info(`Added step to session ${sessionId}: ${step.type} - ${step.description}`);
    return step;
  }

  async updateStep(sessionId: string, stepId: string, updates: Partial<TestStep>): Promise<TestStep> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const stepIndex = session.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) {
      throw new Error(`Step not found: ${stepId}`);
    }

    // Update step
    const updatedStep = { ...session.steps[stepIndex], ...updates };
    session.steps[stepIndex] = updatedStep;
    session.updatedAt = new Date().toISOString();

    // Update storage
    this.activeSessions.set(sessionId, session);
    await this.db.updateStep(stepId, updates);

    logger.info(`Updated step ${stepId} in session ${sessionId}`);
    return updatedStep;
  }

  async removeStep(sessionId: string, stepId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Remove step
    session.steps = session.steps.filter(s => s.id !== stepId);
    session.updatedAt = new Date().toISOString();

    // Update storage
    this.activeSessions.set(sessionId, session);
    await this.db.deleteStep(stepId);

    logger.info(`Removed step ${stepId} from session ${sessionId}`);
  }

  async pauseRecording(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.status = 'paused';
    session.updatedAt = new Date().toISOString();

    const browserSession = this.browserManager.getSession(sessionId);
    if (browserSession) {
      browserSession.isRecording = false;
    }

    this.activeSessions.set(sessionId, session);
    await this.db.updateSession(sessionId, { status: 'paused', updatedAt: session.updatedAt });

    logger.info(`Paused recording for session: ${sessionId}`);
  }

  async stopRecording(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.status = 'stopped';
    session.updatedAt = new Date().toISOString();

    const browserSession = this.browserManager.getSession(sessionId);
    if (browserSession) {
      browserSession.isRecording = false;
    }

    this.activeSessions.set(sessionId, session);
    await this.db.updateSession(sessionId, { status: 'stopped', updatedAt: session.updatedAt });

    logger.info(`Stopped recording for session: ${sessionId}`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    // Close browser session
    await this.browserManager.closeSession(sessionId);

    // Remove from memory and database
    this.activeSessions.delete(sessionId);
    await this.db.deleteSession(sessionId);

    logger.info(`Deleted session: ${sessionId}`);
  }

  getSession(sessionId: string): TestSession | undefined {
    const memorySession = this.activeSessions.get(sessionId);
    if (memorySession) return memorySession;
    
    // If not in memory, try to load from database
    this.db.getSession(sessionId).then(session => {
      if (session) {
        this.activeSessions.set(sessionId, session);
      }
    }).catch(error => {
      logger.error('Error loading session from database:', error);
    });
    
    return undefined;
  }

  async getSessionAsync(sessionId: string): Promise<TestSession | null> {
    const memorySession = this.activeSessions.get(sessionId);
    if (memorySession) return memorySession;
    
    const dbSession = await this.db.getSession(sessionId);
    if (dbSession) {
      this.activeSessions.set(sessionId, dbSession);
    }
    
    return dbSession;
  }

  getAllSessions(): TestSession[] {
    return Array.from(this.activeSessions.values());
  }

  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  async generateCode(sessionId: string): Promise<string> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return this.codeGenerator.generatePlaywrightTest(session);
  }

  async updateSettings(sessionId: string, settings: Partial<SessionSettings>): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.settings = { ...session.settings, ...settings };
    session.updatedAt = new Date().toISOString();

    this.activeSessions.set(sessionId, session);
    await this.db.updateSession(sessionId, { settings: session.settings, updatedAt: session.updatedAt });

    logger.info(`Updated settings for session: ${sessionId}`);
  }
}