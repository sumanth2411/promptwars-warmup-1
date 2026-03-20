import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

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

describe('Emergency Response Assistant', () => {
  it('renders the initial state correctly', () => {
    render(<App />);
    // Check for the main title parts
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
      // Check for High risk level in the specific badge area
      const highRiskElements = screen.getAllByText(/High/i);
      expect(highRiskElements.length).toBeGreaterThan(0);
      expect(screen.getByText(/Call 911/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('has accessible labels', () => {
    render(<App />);
    expect(screen.getByLabelText(/Incident Description/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analyze emergency situation/i })).toBeInTheDocument();
  });
});
