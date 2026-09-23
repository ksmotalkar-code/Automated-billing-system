import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";

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
    console.error("[CRITICAL SHIELD] Uncaught UI error intercepted:", error, errorInfo);
  }

  public handleRecover = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 w-full">
          <div className="p-8 neu-pressed rounded-3xl max-w-lg w-full text-center space-y-6 flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl neu-flat flex items-center justify-center text-blue-600">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight mb-2">View Recovered</h2>
              <p className="text-xs neu-text-muted mb-6">
                The application intercepted a render state anomaly and maintained system integrity.
              </p>
              
              <div className="flex items-center justify-center gap-3">
                <button 
                  onClick={this.handleRecover}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Recover View
                </button>
                <button 
                  onClick={() => window.location.reload()}
                  className="px-5 py-2.5 neu-flat rounded-xl text-xs font-bold hover:bg-black/5 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Home className="w-3.5 h-3.5" />
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
