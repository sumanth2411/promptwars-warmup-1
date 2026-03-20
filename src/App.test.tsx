import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// Set mock env var for maps BEFORE importing App
process.env.GOOGLE_MAPS_PLATFORM_KEY = 'mock-key';

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

// Mock Google GenAI
vi.mock('@google/genai', () => {
  class GoogleGenAI {
    models = {
      generateContent: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          type: 'Medical Emergency',
          riskLevel: 'High',
          actions: ['Call 911', 'Perform CPR'],
          precautions: ['Stay calm'],
          summary: 'Critical medical situation',
          searchQuery: 'nearest hospital'
        })
      })
    };
  }
  return { GoogleGenAI };
});

// Mock Google Maps
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Map: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AdvancedMarker: () => <div>Marker</div>,
  Pin: () => <div>Pin</div>,
  useMap: () => ({ getCenter: () => ({ lat: 0, lng: 0 }) }),
  useMapsLibrary: () => ({ Place: { searchByText: vi.fn().mockResolvedValue({ places: [] }) } }),
}));

// Mock Firebase
vi.mock('./firebase', () => ({
  auth: { currentUser: null },
  db: {},
  signInWithGoogle: vi.fn(),
  logout: vi.fn(),
  handleFirestoreError: vi.fn(),
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  }
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((auth, callback) => {
    callback(null);
    return () => {};
  }),
  getAuth: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  Timestamp: { now: () => ({ toDate: () => new Date() }) },
  getFirestore: vi.fn(),
}));

describe('Emergency Response Assistant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the initial state correctly', () => {
    render(<App />);
    const titles = screen.getAllByText(/Response/i);
    expect(titles.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/AI/i).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText(/Describe the emergency in detail/i)).toBeInTheDocument();
  });

  it('updates input value on change', () => {
    render(<App />);
    const textarea = screen.getByPlaceholderText(/Describe the emergency in detail/i);
    fireEvent.change(textarea, { target: { value: 'Heart attack' } });
    expect(textarea).toHaveValue('Heart attack');
  });

  it('shows loading state and results after analysis', async () => {
    render(<App />);
    const textarea = screen.getByPlaceholderText(/Describe the emergency in detail/i);
    const button = screen.getByRole('button', { name: /Analyze emergency situation/i });

    fireEvent.change(textarea, { target: { value: 'Heart attack' } });
    fireEvent.click(button);

    expect(screen.getByText(/Processing/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Medical Emergency/i)).toBeInTheDocument();
      const highRiskElements = screen.getAllByText(/High/i);
      expect(highRiskElements.length).toBeGreaterThan(0);
      expect(screen.getByText(/Call 911/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('displays sign in button when not authenticated', () => {
    render(<App />);
    expect(screen.getByText(/Sign In with Google/i)).toBeInTheDocument();
  });

  it('calls signInWithGoogle when sign in button is clicked', () => {
    const { signInWithGoogle } = require('./firebase');
    render(<App />);
    const button = screen.getByText(/Sign In with Google/i);
    fireEvent.click(button);
    expect(signInWithGoogle).toHaveBeenCalled();
  });

  it('displays user profile when authenticated', async () => {
    const { onAuthStateChanged } = require('firebase/auth');
    const mockUser = { uid: '123', displayName: 'Test User', photoURL: 'test.jpg' };
    
    onAuthStateChanged.mockImplementationOnce((auth: any, callback: any) => {
      callback(mockUser);
      return () => {};
    });

    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText(/Test/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Sign out/i)).toBeInTheDocument();
    });
  });
});
