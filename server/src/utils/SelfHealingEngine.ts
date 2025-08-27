import { HealingStrategy } from '../types';
import { logger } from './logger';

export class SelfHealingEngine {
  async generateFallbackSelectors(
    primarySelector: string, 
    stepType: string, 
    enabledStrategies: HealingStrategy[]
  ): Promise<string[]> {
    const fallbacks: string[] = [];

    for (const strategy of enabledStrategies) {
      const strategyFallbacks = await this.applyStrategy(strategy, primarySelector, stepType);
      fallbacks.push(...strategyFallbacks);
    }

    // Remove duplicates and return unique fallbacks
    return [...new Set(fallbacks)];
  }

  private async applyStrategy(
    strategy: HealingStrategy, 
    selector: string, 
    stepType: string
  ): Promise<string[]> {
    switch (strategy) {
      case HealingStrategy.ATTRIBUTE_MATCHING:
        return this.generateAttributeBasedFallbacks(selector);
      
      case HealingStrategy.TEXT_CONTENT_MATCHING:
        return this.generateTextBasedFallbacks(selector, stepType);
      
      case HealingStrategy.POSITIONAL_MATCHING:
        return this.generatePositionalFallbacks(selector);
      
      case HealingStrategy.SEMANTIC_SIMILARITY:
        return this.generateSemanticFallbacks(selector, stepType);
      
      case HealingStrategy.VISUAL_AI_MATCHING:
        return this.generateVisualFallbacks(selector);
      
      default:
        return [];
    }
  }

  private generateAttributeBasedFallbacks(selector: string): string[] {
    const fallbacks: string[] = [];

    // Extract information from the primary selector
    if (selector.includes('#')) {
      // ID selector - generate alternatives
      const id = selector.replace('#', '');
      fallbacks.push(`[data-testid="${id}"]`);
      fallbacks.push(`[id*="${id}"]`);
      fallbacks.push(`[name="${id}"]`);
      fallbacks.push(`[aria-label*="${id}"]`);
    } else if (selector.includes('.')) {
      // Class selector - generate alternatives
      const className = selector.replace('.', '');
      fallbacks.push(`[data-testid*="${className}"]`);
      fallbacks.push(`[class*="${className}"]`);
      fallbacks.push(`[aria-label*="${className}"]`);
    } else if (selector.includes('[data-testid')) {
      // Data-testid selector - generate alternatives
      const testId = selector.match(/data-testid="([^"]+)"/)?.[1];
      if (testId) {
        fallbacks.push(`[aria-label*="${testId}"]`);
        fallbacks.push(`[id*="${testId}"]`);
        fallbacks.push(`[name*="${testId}"]`);
        fallbacks.push(`[title*="${testId}"]`);
      }
    }

    return fallbacks;
  }

  private generateTextBasedFallbacks(selector: string, stepType: string): string[] {
    const fallbacks: string[] = [];

    // Generate text-based selectors based on step type
    switch (stepType) {
      case 'click':
        fallbacks.push(`button:has-text("Submit")`);
        fallbacks.push(`button:has-text("Save")`);
        fallbacks.push(`button:has-text("Continue")`);
        fallbacks.push(`a:has-text("Click")`);
        fallbacks.push(`[role="button"]`);
        break;
      
      case 'fill':
        fallbacks.push(`input[type="text"]`);
        fallbacks.push(`input[type="email"]`);
        fallbacks.push(`input[type="password"]`);
        fallbacks.push(`textarea`);
        fallbacks.push(`[role="textbox"]`);
        break;
      
      case 'select':
        fallbacks.push(`select`);
        fallbacks.push(`[role="combobox"]`);
        fallbacks.push(`[role="listbox"]`);
        break;
    }

    return fallbacks;
  }

  private generatePositionalFallbacks(selector: string): string[] {
    const fallbacks: string[] = [];

    // Generate position-based selectors
    const baseSelector = selector.split(' ')[0] || selector;
    
    fallbacks.push(`${baseSelector}:first-child`);
    fallbacks.push(`${baseSelector}:last-child`);
    fallbacks.push(`${baseSelector}:nth-child(1)`);
    fallbacks.push(`${baseSelector}:nth-child(2)`);
    
    // Parent-child relationships
    fallbacks.push(`form ${baseSelector}`);
    fallbacks.push(`div ${baseSelector}`);
    fallbacks.push(`main ${baseSelector}`);

    return fallbacks;
  }

  private generateSemanticFallbacks(selector: string, stepType: string): string[] {
    const fallbacks: string[] = [];

    // Generate semantic HTML and ARIA-based selectors
    switch (stepType) {
      case 'click':
        fallbacks.push(`[role="button"]`);
        fallbacks.push(`[role="link"]`);
        fallbacks.push(`[role="menuitem"]`);
        fallbacks.push(`[role="tab"]`);
        break;
      
      case 'fill':
        fallbacks.push(`[role="textbox"]`);
        fallbacks.push(`[role="searchbox"]`);
        fallbacks.push(`[aria-label*="input"]`);
        fallbacks.push(`[aria-label*="field"]`);
        break;
      
      case 'assertion':
        fallbacks.push(`[role="heading"]`);
        fallbacks.push(`[role="status"]`);
        fallbacks.push(`[role="alert"]`);
        fallbacks.push(`[aria-live]`);
        break;
    }

    return fallbacks;
  }

  private generateVisualFallbacks(selector: string): string[] {
    // This would integrate with visual AI services in a real implementation
    // For now, return basic visual-based selectors
    return [
      `[style*="visible"]`,
      `[style*="display: block"]`,
      `:visible`
    ];
  }

  async validateSelector(selector: string, page: any): Promise<boolean> {
    try {
      const element = page.locator(selector);
      await element.waitFor({ timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }

  async findBestFallback(
    fallbackSelectors: string[], 
    page: any, 
    confidenceThreshold: number = 0.8
  ): Promise<string | null> {
    for (const selector of fallbackSelectors) {
      try {
        const isValid = await this.validateSelector(selector, page);
        if (isValid) {
          logger.info(`Self-healing: Found working fallback selector: ${selector}`);
          return selector;
        }
      } catch (error) {
        logger.debug(`Self-healing: Fallback selector failed: ${selector}`);
      }
    }

    return null;
  }

  async healStep(
    originalSelector: string, 
    fallbackSelectors: string[], 
    page: any
  ): Promise<{ healed: boolean; newSelector?: string; confidence: number }> {
    // Try original selector first
    const originalWorks = await this.validateSelector(originalSelector, page);
    if (originalWorks) {
      return { healed: false, confidence: 1.0 };
    }

    // Try fallback selectors
    const workingFallback = await this.findBestFallback(fallbackSelectors, page);
    if (workingFallback) {
      return { 
        healed: true, 
        newSelector: workingFallback, 
        confidence: 0.8 
      };
    }

    return { healed: false, confidence: 0.0 };
  }
}