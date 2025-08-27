import { chromium, firefox, webkit, Browser, BrowserContext, Page } from 'playwright';
import { logger } from '../utils/logger';
import { BrowserSession } from '../types';

export class BrowserManager {
  private browsers: Map<string, Browser> = new Map();
  private sessions: Map<string, BrowserSession> = new Map();

  async createSession(sessionId: string, browserType: 'chromium' | 'firefox' | 'webkit' = 'chromium'): Promise<BrowserSession> {
    try {
      // Launch browser if not already running
      let browser = this.browsers.get(browserType);
      if (!browser) {
        browser = await this.launchBrowser(browserType);
        this.browsers.set(browserType, browser);
      }

      // Create new context for isolation
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        recordVideo: {
          dir: `./recordings/${sessionId}/videos/`,
          size: { width: 1920, height: 1080 }
        },
        recordHar: {
          path: `./recordings/${sessionId}/network.har`
        }
      });

      // Create new page
      const page = await context.newPage();

      // Enable console logging
      page.on('console', msg => {
        logger.info(`Browser Console [${sessionId}]: ${msg.text()}`);
      });

      // Enable error logging
      page.on('pageerror', error => {
        logger.error(`Browser Error [${sessionId}]: ${error.message}`);
      });

      const session: BrowserSession = {
        sessionId,
        browser,
        context,
        page,
        isRecording: false
      };

      this.sessions.set(sessionId, session);
      logger.info(`Created browser session: ${sessionId}`);

      return session;
    } catch (error) {
      logger.error(`Failed to create browser session ${sessionId}:`, error);
      throw error;
    }
  }

  private async launchBrowser(browserType: 'chromium' | 'firefox' | 'webkit'): Promise<Browser> {
    const options = {
      headless: process.env.NODE_ENV === 'production',
      devtools: process.env.NODE_ENV === 'development',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    };

    switch (browserType) {
      case 'firefox':
        return await firefox.launch(options);
      case 'webkit':
        return await webkit.launch(options);
      default:
        return await chromium.launch(options);
    }
  }

  getSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        await session.context.close();
        this.sessions.delete(sessionId);
        logger.info(`Closed browser session: ${sessionId}`);
      } catch (error) {
        logger.error(`Error closing session ${sessionId}:`, error);
      }
    }
  }

  async closeAll(): Promise<void> {
    logger.info('Closing all browser sessions...');
    
    // Close all sessions
    const closePromises = Array.from(this.sessions.keys()).map(sessionId => 
      this.closeSession(sessionId)
    );
    await Promise.all(closePromises);

    // Close all browsers
    const browserClosePromises = Array.from(this.browsers.values()).map(browser => 
      browser.close()
    );
    await Promise.all(browserClosePromises);

    this.browsers.clear();
    this.sessions.clear();
    
    logger.info('All browser sessions closed');
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  getAllSessions(): BrowserSession[] {
    return Array.from(this.sessions.values());
  }
}