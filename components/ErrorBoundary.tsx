import React from 'react';
import { BUILD_ID } from '../buildInfo';

type ErrorBoundaryState =
  | { hasError: false }
  | { hasError: true; message: string; stack?: string };

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    const message = typeof error?.message === 'string' ? error.message : String(error);
    const stack = typeof error?.stack === 'string' ? error.stack : undefined;
    return { hasError: true, message, stack };
  }

  componentDidCatch() {}

  render() {
    if (!this.state.hasError) return this.props.children;

    const payload = JSON.stringify(
      {
        buildId: BUILD_ID,
        message: this.state.message,
        stack: this.state.stack,
        href: typeof window !== 'undefined' ? window.location.href : '',
      },
      null,
      2
    );

    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-3xl p-6 space-y-4 shadow-2xl">
          <div className="text-white font-bold text-lg">发生错误</div>
          <div className="text-zinc-400 text-xs">Build: {BUILD_ID}</div>
          <div className="text-zinc-300 text-sm break-words">{this.state.message}</div>
          <pre className="text-[11px] text-zinc-500 whitespace-pre-wrap break-words max-h-[240px] overflow-auto bg-black/30 rounded-xl p-3">
            {this.state.stack ?? 'No stack'}
          </pre>
          <div className="grid grid-cols-2 gap-3">
            <button
              className="py-3 rounded-xl bg-white text-black font-bold"
              onClick={() => {
                try {
                  window.location.reload();
                } catch {}
              }}
            >
              刷新
            </button>
            <button
              className="py-3 rounded-xl bg-white/10 text-white font-bold"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(payload);
                  alert('已复制错误信息');
                } catch {
                  alert(payload);
                }
              }}
            >
              复制错误
            </button>
          </div>
        </div>
      </div>
    );
  }
}

