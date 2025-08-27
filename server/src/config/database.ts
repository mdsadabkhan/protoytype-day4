import Database from 'better-sqlite3';
import path from 'path';
import { TestSession, TestStep } from '../types';

class DatabaseManager {
  private db: Database.Database;

  constructor() {
    const dbPath = process.env.NODE_ENV === 'production' 
      ? path.join(process.cwd(), 'data', 'playwright-automation.db')
      : path.join(__dirname, '../../data/playwright-automation.db');
    
    this.db = new Database(dbPath);
    this.initializeTables();
  }

  private initializeTables(): void {
    // Create sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        test_name TEXT NOT NULL,
        target_url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'created',
        settings TEXT NOT NULL,
        metadata TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Create steps table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS steps (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        selector TEXT NOT NULL,
        action_params TEXT,
        description TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        fallback_selectors TEXT,
        screenshot TEXT,
        step_metadata TEXT,
        step_order INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_steps_session_id ON steps(session_id);
      CREATE INDEX IF NOT EXISTS idx_steps_order ON steps(session_id, step_order);
    `);
  }

  // Session operations
  createSession(session: TestSession): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, test_name, target_url, status, settings, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.testName,
      session.targetUrl,
      session.status,
      JSON.stringify(session.settings),
      JSON.stringify(session.metadata),
      session.createdAt,
      session.updatedAt
    );
  }

  getSession(sessionId: string): TestSession | null {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions WHERE id = ?
    `);

    const row = stmt.get(sessionId) as any;
    if (!row) return null;

    const steps = this.getSessionSteps(sessionId);

    return {
      id: row.id,
      testName: row.test_name,
      targetUrl: row.target_url,
      status: row.status,
      settings: JSON.parse(row.settings),
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      steps
    };
  }

  updateSession(sessionId: string, updates: Partial<TestSession>): void {
    const fields = [];
    const values = [];

    if (updates.testName) {
      fields.push('test_name = ?');
      values.push(updates.testName);
    }
    if (updates.targetUrl) {
      fields.push('target_url = ?');
      values.push(updates.targetUrl);
    }
    if (updates.status) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.settings) {
      fields.push('settings = ?');
      values.push(JSON.stringify(updates.settings));
    }
    if (updates.metadata) {
      fields.push('metadata = ?');
      values.push(JSON.stringify(updates.metadata));
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(sessionId);

    const stmt = this.db.prepare(`
      UPDATE sessions SET ${fields.join(', ')} WHERE id = ?
    `);

    stmt.run(...values);
  }

  deleteSession(sessionId: string): void {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    stmt.run(sessionId);
  }

  // Step operations
  addStep(sessionId: string, step: TestStep, order: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO steps (
        id, session_id, type, selector, action_params, description, 
        timestamp, fallback_selectors, screenshot, step_metadata, step_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      step.id,
      sessionId,
      step.type,
      step.selector,
      step.actionParams ? JSON.stringify(step.actionParams) : null,
      step.description,
      step.timestamp,
      step.fallbackSelectors ? JSON.stringify(step.fallbackSelectors) : null,
      step.screenshot || null,
      step.metadata ? JSON.stringify(step.metadata) : null,
      order
    );
  }

  getSessionSteps(sessionId: string): TestStep[] {
    const stmt = this.db.prepare(`
      SELECT * FROM steps WHERE session_id = ? ORDER BY step_order ASC
    `);

    const rows = stmt.all(sessionId) as any[];

    return rows.map(row => ({
      id: row.id,
      type: row.type,
      selector: row.selector,
      actionParams: row.action_params ? JSON.parse(row.action_params) : undefined,
      description: row.description,
      timestamp: row.timestamp,
      fallbackSelectors: row.fallback_selectors ? JSON.parse(row.fallback_selectors) : undefined,
      screenshot: row.screenshot || undefined,
      metadata: row.step_metadata ? JSON.parse(row.step_metadata) : undefined
    }));
  }

  updateStep(stepId: string, updates: Partial<TestStep>): void {
    const fields = [];
    const values = [];

    if (updates.selector) {
      fields.push('selector = ?');
      values.push(updates.selector);
    }
    if (updates.actionParams) {
      fields.push('action_params = ?');
      values.push(JSON.stringify(updates.actionParams));
    }
    if (updates.description) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.fallbackSelectors) {
      fields.push('fallback_selectors = ?');
      values.push(JSON.stringify(updates.fallbackSelectors));
    }
    if (updates.screenshot) {
      fields.push('screenshot = ?');
      values.push(updates.screenshot);
    }
    if (updates.metadata) {
      fields.push('step_metadata = ?');
      values.push(JSON.stringify(updates.metadata));
    }

    values.push(stepId);

    const stmt = this.db.prepare(`
      UPDATE steps SET ${fields.join(', ')} WHERE id = ?
    `);

    stmt.run(...values);
  }

  deleteStep(stepId: string): void {
    const stmt = this.db.prepare('DELETE FROM steps WHERE id = ?');
    stmt.run(stepId);
  }

  getAllSessions(): TestSession[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions ORDER BY created_at DESC
    `);

    const rows = stmt.all() as any[];

    return rows.map(row => ({
      id: row.id,
      testName: row.test_name,
      targetUrl: row.target_url,
      status: row.status,
      settings: JSON.parse(row.settings),
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      steps: this.getSessionSteps(row.id)
    }));
  }

  close(): void {
    this.db.close();
  }
}

export const db = new DatabaseManager();