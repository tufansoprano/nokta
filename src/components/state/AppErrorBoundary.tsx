import { Component, type ErrorInfo, type ReactNode } from "react";
import { RouteErrorState } from "@/components/state/RouteErrorState";
import { reportError } from "@/lib/errorReporting";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { source: "app_error_boundary", component_stack: info.componentStack ?? null });
  }

  render() {
    if (this.state.error) {
      return <RouteErrorState devDetail={import.meta.env.DEV ? this.state.error.stack : null} />;
    }

    return this.props.children;
  }
}
