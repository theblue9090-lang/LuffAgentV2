import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  label?: string;
}
interface State {
  hasError: boolean;
  message?: string;
}

// Catches render errors so a single failing section never blanks the whole app.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("LUFF AGENT render error", err, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="container" style={{ padding: "40px 22px" }}>
        <div className="card" style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: "2.2rem", marginBottom: 10 }}>⚠️</div>
          <h3 style={{ fontFamily: "var(--font-display)", margin: "0 0 8px" }}>
            {this.props.label || "Something glitched"}
          </h3>
          <p style={{ color: "var(--text-dim)", maxWidth: 460, margin: "0 auto 18px" }}>
            This part of LUFF AGENT hit an error and was contained so the rest of the app keeps
            working. Try reloading.
          </p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
