import { Component, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  info: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, info: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, info: "" };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("=== CRASH REPORT ===");
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    console.error("Component stack:", info.componentStack);
    console.error("====================");
    this.setState({ info: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <Card className="m-4">
          <CardContent className="py-8 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
            <p className="font-medium text-sm">Something went wrong</p>
            <p className="text-xs text-muted-foreground font-mono">{this.state.error?.message}</p>
            <Button size="sm" variant="outline" onClick={() => this.setState({ hasError: false, error: null, info: "" })}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}
