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
        <div style={{
          position: "fixed", inset: 0, background: "#FFFFFF",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 16, padding: 24, color: "#1A1A2E",
        }}>
          <AlertTriangle style={{ width: 40, height: 40, color: "#e24b4a" }} />
          <p style={{ fontWeight: 600, fontSize: 16, margin: 0 }}>Something went wrong</p>
          <p style={{ fontSize: 12, color: "#6B6B7D", fontFamily: "monospace", maxWidth: 360, textAlign: "center", margin: 0 }}>
            {this.state.error?.message}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null, info: "" }); window.location.href = "/"; }}
            style={{ marginTop: 8, padding: "8px 20px", borderRadius: 8, background: "#1A1A2E", color: "#fff", border: "none", cursor: "pointer", fontSize: 14 }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
