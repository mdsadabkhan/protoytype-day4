export interface TestStep {
  id: string;
  type: 'navigate' | 'click' | 'fill' | 'select' | 'wait' | 'assertion' | 'screenshot';
  selector: string;
  actionParams?: Record<string, any>;
  description: string;
  timestamp: string;
  fallbackSelectors?: string[];
  screenshot?: string;
  metadata?: Record<string, any>;
}

export interface TestSession {
  id: string;
  testName: string;
  targetUrl: string;
  steps: TestStep[];
  status: 'created' | 'recording' | 'paused' | 'stopped' | 'completed';
  createdAt: string;
  updatedAt: string;
  settings: SessionSettings;
  metadata: {
    viewport: { width: number; height: number };
    userAgent: string;
    browser: string;
  };
}

export interface SessionSettings {
  healingStrategies: HealingStrategy[];
  confidenceThreshold: number;
  maxRetryAttempts: number;
  fallbackTimeout: number;
  screenshotMode: 'none' | 'on-failure' | 'always';
  waitTimeout: number;
  assertionStrictness: 'strict' | 'loose';
}

export enum HealingStrategy {
  ATTRIBUTE_MATCHING = 'attribute_matching',
  TEXT_CONTENT_MATCHING = 'text_content_matching',
  POSITIONAL_MATCHING = 'positional_matching',
  VISUAL_AI_MATCHING = 'visual_ai_matching',
  SEMANTIC_SIMILARITY = 'semantic_similarity'
}

export interface BrowserSession {
  sessionId: string;
  browser: any; // Playwright Browser instance
  context: any; // Playwright BrowserContext
  page: any; // Playwright Page
  isRecording: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface CreateSessionRequest {
  testName: string;
  targetUrl: string;
  settings?: Partial<SessionSettings>;
}

export interface AddStepRequest {
  type: TestStep['type'];
  selector: string;
  actionParams?: Record<string, any>;
  description: string;
}

export interface UpdateStepRequest {
  selector?: string;
  actionParams?: Record<string, any>;
  description?: string;
}

export interface WebSocketEvents {
  'recording:started': { sessionId: string; targetUrl: string };
  'step:recorded': { sessionId: string; step: TestStep };
  'step:updated': { sessionId: string; stepId: string; step: TestStep };
  'recording:paused': { sessionId: string };
  'recording:resumed': { sessionId: string };
  'recording:ended': { sessionId: string };
  'session:error': { sessionId: string; error: string };
  'browser:action': { sessionId: string; action: any };
}