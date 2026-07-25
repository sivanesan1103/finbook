import { Component, ReactNode } from 'react';
import { reportClientError } from '../reportError';

/** Catches render-time crashes React would otherwise blank the screen on, reports them, and shows a minimal fallback instead of a white page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    reportClientError(error.message, `${error.stack}\n${info.componentStack}`);
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="h-screen flex flex-col items-center justify-center gap-3 text-center px-6">
          <p className="text-lg font-semibold text-slate-800">Something went wrong.</p>
          <p className="text-sm text-slate-500">Please reload the page. This has been reported.</p>
          <button className="btn-primary mt-2" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
