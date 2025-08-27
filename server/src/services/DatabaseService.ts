import { supabase } from '../config/supabase';
import { TestSession, TestStep } from '../types';
import { logger } from '../utils/logger';

export class DatabaseService {
  async createSession(session: TestSession): Promise<void> {
    try {
      const { error } = await supabase
        .from('sessions')
        .insert({
          id: session.id,
          test_name: session.testName,
          target_url: session.targetUrl,
          status: session.status,
          settings: session.settings,
          metadata: session.metadata,
          created_at: session.createdAt,
          updated_at: session.updatedAt
        });

      if (error) {
        logger.error('Error creating session:', error);
        throw error;
      }

      logger.info(`Session created in database: ${session.id}`);
    } catch (error) {
      logger.error('Database error creating session:', error);
      throw error;
    }
  }

  async getSession(sessionId: string): Promise<TestSession | null> {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Session not found
        }
        logger.error('Error getting session:', error);
        throw error;
      }

      // Get steps for this session
      const steps = await this.getSessionSteps(sessionId);

      return {
        id: data.id,
        testName: data.test_name,
        targetUrl: data.target_url,
        status: data.status,
        settings: data.settings,
        metadata: data.metadata,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        steps
      };
    } catch (error) {
      logger.error('Database error getting session:', error);
      throw error;
    }
  }

  async updateSession(sessionId: string, updates: Partial<TestSession>): Promise<void> {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (updates.testName) updateData.test_name = updates.testName;
      if (updates.targetUrl) updateData.target_url = updates.targetUrl;
      if (updates.status) updateData.status = updates.status;
      if (updates.settings) updateData.settings = updates.settings;
      if (updates.metadata) updateData.metadata = updates.metadata;

      const { error } = await supabase
        .from('sessions')
        .update(updateData)
        .eq('id', sessionId);

      if (error) {
        logger.error('Error updating session:', error);
        throw error;
      }

      logger.info(`Session updated in database: ${sessionId}`);
    } catch (error) {
      logger.error('Database error updating session:', error);
      throw error;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionId);

      if (error) {
        logger.error('Error deleting session:', error);
        throw error;
      }

      logger.info(`Session deleted from database: ${sessionId}`);
    } catch (error) {
      logger.error('Database error deleting session:', error);
      throw error;
    }
  }

  async addStep(sessionId: string, step: TestStep, order: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('steps')
        .insert({
          id: step.id,
          session_id: sessionId,
          type: step.type,
          selector: step.selector,
          value: step.actionParams?.value || null,
          description: step.description,
          step_order: order,
          fallback_selectors: step.fallbackSelectors || null,
          metadata: step.metadata || null,
          created_at: step.timestamp
        });

      if (error) {
        logger.error('Error adding step:', error);
        throw error;
      }

      logger.info(`Step added to database: ${step.id}`);
    } catch (error) {
      logger.error('Database error adding step:', error);
      throw error;
    }
  }

  async getSessionSteps(sessionId: string): Promise<TestStep[]> {
    try {
      const { data, error } = await supabase
        .from('steps')
        .select('*')
        .eq('session_id', sessionId)
        .order('step_order', { ascending: true });

      if (error) {
        logger.error('Error getting session steps:', error);
        throw error;
      }

      return data.map(row => ({
        id: row.id,
        type: row.type,
        selector: row.selector,
        actionParams: row.value ? { value: row.value } : undefined,
        description: row.description,
        timestamp: row.created_at,
        fallbackSelectors: row.fallback_selectors || undefined,
        metadata: row.metadata || undefined
      }));
    } catch (error) {
      logger.error('Database error getting session steps:', error);
      throw error;
    }
  }

  async updateStep(stepId: string, updates: Partial<TestStep>): Promise<void> {
    try {
      const updateData: any = {};

      if (updates.selector) updateData.selector = updates.selector;
      if (updates.actionParams) updateData.value = updates.actionParams.value;
      if (updates.description) updateData.description = updates.description;
      if (updates.fallbackSelectors) updateData.fallback_selectors = updates.fallbackSelectors;
      if (updates.metadata) updateData.metadata = updates.metadata;

      const { error } = await supabase
        .from('steps')
        .update(updateData)
        .eq('id', stepId);

      if (error) {
        logger.error('Error updating step:', error);
        throw error;
      }

      logger.info(`Step updated in database: ${stepId}`);
    } catch (error) {
      logger.error('Database error updating step:', error);
      throw error;
    }
  }

  async deleteStep(stepId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('steps')
        .delete()
        .eq('id', stepId);

      if (error) {
        logger.error('Error deleting step:', error);
        throw error;
      }

      logger.info(`Step deleted from database: ${stepId}`);
    } catch (error) {
      logger.error('Database error deleting step:', error);
      throw error;
    }
  }

  async getAllSessions(): Promise<TestSession[]> {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error getting all sessions:', error);
        throw error;
      }

      const sessions: TestSession[] = [];
      for (const row of data) {
        const steps = await this.getSessionSteps(row.id);
        sessions.push({
          id: row.id,
          testName: row.test_name,
          targetUrl: row.target_url,
          status: row.status,
          settings: row.settings,
          metadata: row.metadata,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          steps
        });
      }

      return sessions;
    } catch (error) {
      logger.error('Database error getting all sessions:', error);
      throw error;
    }
  }
}