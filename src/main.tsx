import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

/* The service worker is what lets a résumé be built with the network off —
 * see public/sw.js. It is registered only in a real build: in dev it would
 * sit in front of Vite's module graph and serve yesterday's code. The URL is
 * resolved against the document base so it still works from a Pages subpath,
 * and a refusal is not worth a word to the user — the app is fully working
 * either way, it just has to ask the network next time. */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(new URL("sw.js", document.baseURI)).catch(() => {});
  });
}
