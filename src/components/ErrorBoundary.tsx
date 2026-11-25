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
    console.error('Skyforge ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-[#121824] p-6 text-[#f4ede2]">
          <div className="w-full max-w-md rounded-xl border border-[#c9933c]/50 bg-[#1a2232] p-6 shadow-2xl">
            <h2 className="font-display text-xl font-bold text-[#f4d38c]">Citadel Recovery</h2>
            <p className="mt-2 text-sm text-[#cbd5e1] break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 w-full rounded-lg bg-[#c9933c] px-4 py-2.5 text-sm font-semibold text-[#111622] hover:bg-[#dfb058]"
            >
              Reload Arena
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
