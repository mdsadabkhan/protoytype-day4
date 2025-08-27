import { Router } from 'express';
import { SessionManager } from '../services/SessionManager';
import { ApiResponse } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { PlaywrightCodeGenerator } from '../utils/PlaywrightCodeGenerator';
import { CICDConfigGenerator } from '../utils/CICDConfigGenerator';

export function exportRoutes(sessionManager: SessionManager): Router {
  const router = Router();
  const codeGenerator = new PlaywrightCodeGenerator();
  const cicdGenerator = new CICDConfigGenerator();

  // Export generated Playwright code
  router.get('/:sessionId',
    asyncHandler(async (req, res) => {
      const { sessionId } = req.params;
      const { format = 'json' } = req.query;
      
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      const generatedCode = codeGenerator.generatePlaywrightTest(session);

      if (format === 'file') {
        const filename = `${session.testName.toLowerCase().replace(/\s+/g, '-')}.spec.ts`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'text/typescript');
        return res.send(generatedCode);
      }

      const response: ApiResponse = {
        success: true,
        data: {
          code: generatedCode,
          filename: `${session.testName.toLowerCase().replace(/\s+/g, '-')}.spec.ts`,
          language: 'typescript'
        }
      };

      res.json(response);
    })
  );

  // Export complete test suite with config files
  router.get('/:sessionId/suite',
    asyncHandler(async (req, res) => {
      const { sessionId } = req.params;
      const { platform = 'github' } = req.query;
      
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      const testCode = codeGenerator.generatePlaywrightTest(session);
      const playwrightConfig = codeGenerator.generatePlaywrightConfig();
      const packageJson = codeGenerator.generatePackageJson(session.testName);
      const cicdConfig = cicdGenerator.generateConfig(platform as string);

      const response: ApiResponse = {
        success: true,
        data: {
          files: {
            [`tests/${session.testName.toLowerCase().replace(/\s+/g, '-')}.spec.ts`]: testCode,
            'playwright.config.ts': playwrightConfig,
            'package.json': packageJson,
            [cicdGenerator.getConfigFilename(platform as string)]: cicdConfig
          },
          metadata: {
            testName: session.testName,
            stepsCount: session.steps.length,
            targetUrl: session.targetUrl,
            createdAt: session.createdAt
          }
        }
      };

      res.json(response);
    })
  );

  // Export CI/CD configuration
  router.get('/:sessionId/cicd/:platform',
    asyncHandler(async (req, res) => {
      const { sessionId, platform } = req.params;
      const { format = 'json' } = req.query;
      
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      const cicdConfig = cicdGenerator.generateConfig(platform);
      const filename = cicdGenerator.getConfigFilename(platform);

      if (format === 'file') {
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'text/yaml');
        return res.send(cicdConfig);
      }

      const response: ApiResponse = {
        success: true,
        data: {
          config: cicdConfig,
          filename,
          platform
        }
      };

      res.json(response);
    })
  );

  // Export test report/documentation
  router.get('/:sessionId/report',
    asyncHandler(async (req, res) => {
      const { sessionId } = req.params;
      
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      const report = {
        testName: session.testName,
        description: `Automated test for ${session.targetUrl}`,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        targetUrl: session.targetUrl,
        stepsCount: session.steps.length,
        steps: session.steps.map((step, index) => ({
          stepNumber: index + 1,
          type: step.type,
          description: step.description,
          selector: step.selector,
          timestamp: step.timestamp
        })),
        settings: session.settings,
        metadata: session.metadata
      };

      const response: ApiResponse = {
        success: true,
        data: report
      };

      res.json(response);
    })
  );

  return router;
}