import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { apiService } from '../services/api';
import { wsService } from '../services/websocket';
import { RecordingState, TestStep, GeneratedTest, HealingStrategy } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface RecordingContextType {
  state: RecordingState;
  startRecording: (testName: string, url: string) => Promise<void>;
  pauseRecording: () => void;
  stopRecording: () => Promise<void>;
  addStep: (step: Omit<TestStep, 'id' | 'timestamp'>) => void;
  removeStep: (stepId: string) => void;
  updateStep: (stepId: string, updates: Partial<TestStep>) => void;
  clearSteps: () => void;
  updateHealingConfig: (config: Partial<RecordingState['healingConfig']>) => void;
}

type RecordingAction =
  | { type: 'START_RECORDING'; payload: { testName: string; url: string } }
  | { type: 'PAUSE_RECORDING' }
  | { type: 'STOP_RECORDING' }
  | { type: 'ADD_STEP'; payload: TestStep }
  | { type: 'REMOVE_STEP'; payload: string }
  | { type: 'UPDATE_STEP'; payload: { stepId: string; updates: Partial<TestStep> } }
  | { type: 'CLEAR_STEPS' }
  | { type: 'UPDATE_HEALING_CONFIG'; payload: Partial<RecordingState['healingConfig']> }
  | { type: 'SET_SESSION_ID'; payload: string };

const initialState: RecordingState = {
  isRecording: false,
  isPaused: false,
  currentTest: null,
  steps: [],
  sessionId: null,
  healingConfig: {
    enabledStrategies: [
      HealingStrategy.ATTRIBUTE_MATCHING,
      HealingStrategy.TEXT_CONTENT_MATCHING,
      HealingStrategy.POSITIONAL_MATCHING
    ],
    confidenceThreshold: 0.8,
    maxRetryAttempts: 3,
    fallbackTimeout: 5000
  }
};

function recordingReducer(state: RecordingState, action: RecordingAction): RecordingState {
  switch (action.type) {
    case 'START_RECORDING':
      const newTest: GeneratedTest = {
        id: uuidv4(),
        name: action.payload.testName,
        description: `Generated test for ${action.payload.url}`,
        steps: [],
        assertions: [],
        metadata: {
          url: action.payload.url,
          viewport: { width: 1920, height: 1080 },
          createdAt: new Date(),
          lastModified: new Date()
        }
      };
      return {
        ...state,
        isRecording: true,
        isPaused: false,
        currentTest: newTest,
        steps: []
      };

    case 'PAUSE_RECORDING':
      return { ...state, isPaused: !state.isPaused };

    case 'STOP_RECORDING':
      return {
        ...state,
        isRecording: false,
        isPaused: false
      };

    case 'ADD_STEP':
      return {
        ...state,
        steps: [...state.steps, action.payload]
      };

    case 'REMOVE_STEP':
      return {
        ...state,
        steps: state.steps.filter(step => step.id !== action.payload)
      };

    case 'UPDATE_STEP':
      return {
        ...state,
        steps: state.steps.map(step =>
          step.id === action.payload.stepId
            ? { ...step, ...action.payload.updates }
            : step
        )
      };

    case 'CLEAR_STEPS':
      return { ...state, steps: [] };

    case 'UPDATE_HEALING_CONFIG':
      return {
        ...state,
        healingConfig: { ...state.healingConfig, ...action.payload }
      };

    case 'SET_SESSION_ID':
      return {
        ...state,
        sessionId: action.payload
      };

    default:
      return state;
  }
}

const RecordingContext = createContext<RecordingContextType | undefined>(undefined);

export function RecordingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(recordingReducer, initialState);

  React.useEffect(() => {
    wsService.connect();

    wsService.on('step:recorded', (data) => {
      const step: TestStep = {
        ...data.step,
        timestamp: Date.now()
      };
      dispatch({ type: 'ADD_STEP', payload: step });
    });

    wsService.on('recording:started', (data) => {
      console.log('Recording started:', data);
    });

    wsService.on('recording:ended', (data) => {
      console.log('Recording ended:', data);
      dispatch({ type: 'STOP_RECORDING' });
    });

    wsService.on('session:error', (data) => {
      console.error('Session error:', data);
    });

    return () => {
      wsService.disconnect();
    };
  }, []);

  const startRecording = async (testName: string, url: string) => {
    try {
      // Create session via API
      const response = await apiService.createSession({ testName, targetUrl: url });
      const sessionId = response.data.sessionId;
      
      dispatch({ type: 'SET_SESSION_ID', payload: sessionId });
      dispatch({ type: 'START_RECORDING', payload: { testName, url } });
      
      // Join WebSocket session
      wsService.joinSession(sessionId);
      
      // Start recording
      await apiService.startRecording(sessionId);
      
      // Open recording window
      const recordingUrl = `http://localhost:3001/recording/${sessionId}`;
      window.open(recordingUrl, '_blank', 'width=1200,height=800');
      
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const pauseRecording = () => {
    dispatch({ type: 'PAUSE_RECORDING' });
  };

  const stopRecording = async () => {
    try {
      if (state.sessionId) {
        await apiService.stopRecording(state.sessionId);
        wsService.leaveSession(state.sessionId);
      }
      dispatch({ type: 'STOP_RECORDING' });
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  const addStep = (stepData: Omit<TestStep, 'id' | 'timestamp'>) => {
    const step: TestStep = {
      ...stepData,
      id: uuidv4(),
      timestamp: Date.now()
    };
    dispatch({ type: 'ADD_STEP', payload: step });
  };

  const removeStep = (stepId: string) => {
    dispatch({ type: 'REMOVE_STEP', payload: stepId });
  };

  const updateStep = (stepId: string, updates: Partial<TestStep>) => {
    dispatch({ type: 'UPDATE_STEP', payload: { stepId, updates } });
  };

  const clearSteps = () => {
    dispatch({ type: 'CLEAR_STEPS' });
  };

  const updateHealingConfig = (config: Partial<RecordingState['healingConfig']>) => {
    dispatch({ type: 'UPDATE_HEALING_CONFIG', payload: config });
  };

  return (
    <RecordingContext.Provider
      value={{
        state,
        startRecording,
        pauseRecording,
        stopRecording,
        addStep,
        removeStep,
        updateStep,
        clearSteps,
        updateHealingConfig
      }}
    >
      {children}
    </RecordingContext.Provider>
  );
}

export function useRecording() {
  const context = useContext(RecordingContext);
  if (context === undefined) {
    throw new Error('useRecording must be used within a RecordingProvider');
  }
  return context;
}