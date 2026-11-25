import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('EIDRATH ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-[#171B1E] p-6 text-[#D9D1BE]">
          <div className="w-full max-w-md border border-[#9C7848]/70 bg-[#22272B] p-6 shadow-2xl">
            <h2 className="font-display text-xl font-bold uppercase tracking-[0.16em] text-[#D9D1BE]">
              EIDRATH Recovery
            </h2>
            <p className="mt-2 text-sm text-[#D9D1BE]/80 break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 w-full border border-[#9C7848] bg-[#9C7848]/25 px-4 py-2.5 text-sm font-semibold uppercase tracking-widest text-[#D9D1BE] hover:bg-[#9C7848]/40"
            >
              Reload EIDRATH
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
