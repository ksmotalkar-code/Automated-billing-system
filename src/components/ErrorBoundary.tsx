import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle } from "lucide-react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 w-full">
          <div className="p-8 neu-pressed rounded-3xl max-w-lg w-full text-center space-y-6 flex flex-col items-center">
            <div className="w-20 h-20 rounded-2xl neu-flat flex items-center justify-center text-rose-600">
              <AlertCircle className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-rose-600 mb-2">UI Render Error</h2>
              <p className="text-sm neu-text-muted mb-4">The application encountered an unexpected error while trying to display this view.</p>
              <div className="p-4 bg-rose-500/10 text-rose-600 rounded-xl text-xs text-left overflow-auto max-h-32 mb-6">
                <code>{this.state.error?.message}</code>
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-colors"
              >
                Reload Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
