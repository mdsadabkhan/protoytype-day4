import { TestSession, TestStep } from '../types';

export class PlaywrightCodeGenerator {
  generatePlaywrightTest(session: TestSession): string {
    const imports = this.generateImports();
    const testFunction = this.generateTestFunction(session);
    const helperFunctions = this.generateHelperFunctions();

    return `${imports}\n\n${testFunction}\n\n${helperFunctions}`;
  }

  private generateImports(): string {
    return `import { test, expect, Page } from '@playwright/test';`;
  }

  private generateTestFunction(session: TestSession): string {
    const testName = session.testName;
    const steps = session.steps.map(step => this.generateStepCode(step)).join('\n');

    return `test('${testName}', async ({ page }) => {
${steps}
});`;
  }

  private generateStepCode(step: TestStep): string {
    const indent = '  ';
    
    switch (step.type) {
      case 'navigate':
        return `${indent}// ${step.description}
${indent}await page.goto('${step.actionParams?.url || step.selector}');`;
      
      case 'click':
        return `${indent}// ${step.description}
${indent}await findElementWithHealing(page, '${step.selector}', ${JSON.stringify(step.fallbackSelectors || [])}).click();`;
      
      case 'fill':
        return `${indent}// ${step.description}
${indent}await findElementWithHealing(page, '${step.selector}', ${JSON.stringify(step.fallbackSelectors || [])}).fill('${step.actionParams?.value || ''}');`;
      
      case 'select':
        return `${indent}// ${step.description}
${indent}await findElementWithHealing(page, '${step.selector}', ${JSON.stringify(step.fallbackSelectors || [])}).selectOption('${step.actionParams?.value || ''}');`;
      
      case 'wait':
        return `${indent}// ${step.description}
${indent}await smartWait(page, '${step.actionParams?.condition || 'networkidle'}', ${step.actionParams?.timeout || 5000});`;
      
      case 'assertion':
        return `${indent}// ${step.description}
${indent}await expect(findElementWithHealing(page, '${step.selector}', ${JSON.stringify(step.fallbackSelectors || [])})).toContainText('${step.actionParams?.expectedText || ''}');`;
      
      case 'screenshot':
        return `${indent}// ${step.description}
${indent}await page.screenshot({ path: 'test-results/${step.actionParams?.filename || 'screenshot'}.png', fullPage: true });`;
      
      default:
        return `${indent}// Unknown step type: ${step.type}`;
    }
  }

  private generateHelperFunctions(): string {
    return `// Self-healing helper functions
async function findElementWithHealing(page: Page, selector: string, fallbackSelectors: string[] = []): Promise<any> {
  try {
    const element = page.locator(selector);
    await element.waitFor({ timeout: 5000 });
    return element;
  } catch (error) {
    console.warn(\`Primary selector failed: \${selector}\`);
    
    for (const fallback of fallbackSelectors) {
      try {
        console.log(\`Trying fallback selector: \${fallback}\`);
        const element = page.locator(fallback);
        await element.waitFor({ timeout: 5000 });
        return element;
      } catch (fallbackError) {
        console.warn(\`Fallback selector failed: \${fallback}\`);
      }
    }
    
    throw new Error(\`All selectors failed for: \${selector}\`);
  }
}

async function smartWait(page: Page, condition: string, timeout: number = 5000): Promise<void> {
  try {
    switch (condition) {
      case 'networkidle':
        await page.waitForLoadState('networkidle', { timeout });
        break;
      case 'domcontentloaded':
        await page.waitForLoadState('domcontentloaded', { timeout });
        break;
      case 'load':
        await page.waitForLoadState('load', { timeout });
        break;
      default:
        await page.waitForTimeout(timeout);
    }
  } catch (error) {
    console.warn(\`Wait condition '\${condition}' timed out, continuing...\`);
  }
}`;
  }

  generatePlaywrightConfig(): string {
    return `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['junit', { outputFile: 'results.xml' }],
    ['json', { outputFile: 'test-results.json' }]
  ],
  
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});`;
  }

  generatePackageJson(testName: string): string {
    return JSON.stringify({
      name: testName.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      description: `Playwright tests for ${testName}`,
      scripts: {
        test: 'playwright test',
        'test:headed': 'playwright test --headed',
        'test:debug': 'playwright test --debug',
        'test:ui': 'playwright test --ui',
        report: 'playwright show-report',
        'install:browsers': 'playwright install'
      },
      devDependencies: {
        '@playwright/test': '^1.40.0'
      }
    }, null, 2);
  }
}