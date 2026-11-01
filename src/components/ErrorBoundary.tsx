import { Component, type ErrorInfo, type ReactNode } from "react";
import { STORE_KEY } from "../storage";

/* The résumé lives in this browser and nowhere else unless Drive is on, so a
 * crash must not be a dead end. Whatever the app can no longer draw, the JSON
 * behind it is still sitting in localStorage and still the user's — this
 * reads that key raw, through none of the code that just failed, so the way
 * out keeps working even when the store itself is what broke.
 *
 * Nothing here is destructive and nothing clears storage: a white page is
 * recoverable, a helpful "reset" over the only copy of someone's résumé is
 * not. Reloading is offered because most render faults do not survive one. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CVLian crashed while rendering:", error, info.componentStack);
  }

  private rescue = () => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORE_KEY);
    } catch {
      /* blocked site data — there was never anything to rescue */
    }
    const blob = new Blob([raw ?? "{}"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cvlian-rescue-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    let saved = false;
    try {
      saved = localStorage.getItem(STORE_KEY) !== null;
    } catch {
      saved = false;
    }

    return (
      <div className="crash">
        <div className="crash-card">
          <h1>CV<i>Lian</i></h1>
          <strong>Something in the editor stopped working.</strong>
          <p>
            {saved
              ? "Your résumé is still saved in this browser — this is the page that broke, not your work. Take a copy before anything else, then reload."
              : "There is no résumé saved in this browser yet, so there is nothing to lose. Reloading should put this right."}
          </p>
          <div className="crash-acts">
            {saved && (
              <button className="btn primary" onClick={this.rescue}>
                Download my résumé
              </button>
            )}
            <button className="btn" onClick={() => location.reload()}>
              Reload the page
            </button>
          </div>
          <details className="crash-log">
            <summary>Technical details</summary>
            <pre>{error.stack ?? error.message}</pre>
          </details>
        </div>
      </div>
    );
  }
}
