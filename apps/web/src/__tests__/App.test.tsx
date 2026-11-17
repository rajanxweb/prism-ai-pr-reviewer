import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App.js';

describe('App Component', () => {
  it('renders the header and dashboard elements', () => {
    render(<App />);

    const heading = screen.getByRole('heading', { level: 1, name: /AI PR Reviewer/i });
    expect(heading).toBeInTheDocument();

    expect(screen.getByText(/System Status/i)).toBeInTheDocument();
    expect(screen.getByText(/Operational/i)).toBeInTheDocument();
    expect(screen.getByText(/PRs Analyzed/i)).toBeInTheDocument();
  });
});
