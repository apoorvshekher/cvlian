import { useState } from "react";
import { normalizeStore } from "../storage";
import { googleDrive } from "../sync/googleDrive";
import type { Store } from "../types";
import { GoogleMark } from "./icons";

/* The front page, and it really is the default one — a guest meets it every
 * visit. That is deliberate: being a guest is a session like any other, and
 * the account should be on offer each time rather than buried in a setting.
 * Only a Google session that comes back silently skips this.
 *
 * Both doors land in the same editor and the choice is reversible from the
 * panel, so nobody is committing to anything here. */
export function Landing({
  hasLocalWork,
  onEnter,
}: {
  hasLocalWork: boolean;
  onEnter: (initial: Store | null, as: "guest" | "google") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const withGoogle = async () => {
    setBusy(true);
    setError("");
    try {
      const ok = await googleDrive.connect(false);
      if (!ok) {
        setBusy(false);
        return;
      }
      /* If Drive already holds a workspace, start from it rather than the
       * sample — that is the whole point of choosing this door. */
      const remote = await googleDrive.load();
      onEnter(remote ? normalizeStore(remote.payload) : null, "google");
    } catch (err) {
      setError((err as Error)?.message ?? "Could not connect to Google Drive");
      setBusy(false);
    }
  };

  return (
    <div className="landing">
      <div className="landing-top">
        <span className="brand-wm">CV<i>Lian</i></span>
        <h1>CVLian typesets your résumé in real LaTeX, right in the browser.</h1>
        <p className="landing-lede">
          No server sees your résumé, because there is no server. Sign in to keep it
          in your own Drive, or carry on as a guest — <b>you can switch either way
          later without losing anything</b>.
        </p>
      </div>

      <div className="doors">
        <section className="door">
          <div className="dnum">Guest</div>
          <h2 className="dtitle">
            {hasLocalWork ? "Carry on as a guest" : "Start as a guest"}
          </h2>
          <p className="dsub">
            {hasLocalWork
              ? "Your résumé is still here, in this browser, exactly as you left it. Nothing to sign into."
              : "Nothing leaves the browser. Start typing in a couple of seconds, with no sign-in of any kind."}
          </p>
          <ul className="dpoints">
            <li><span className="tick">✓</span><span>No account, no email address, no consent screen</span></li>
            <li><span className="tick">✓</span><span>Works offline once the page has loaded</span></li>
            <li><span className="cross">—</span><span className="muted">Stays in this one browser on this one machine</span></li>
            <li><span className="cross">—</span><span className="muted">Clearing site data erases it — export a backup</span></li>
          </ul>
          <div className="dact">
            <button className="dbtn" disabled={busy} onClick={() => onEnter(null, "guest")}>
              {hasLocalWork ? "Continue as guest" : "Start writing"}
            </button>
            <p className="dfine">
              Your work lives in this browser's storage. You can sign in at any point
              from inside the editor, and everything you wrote as a guest comes with you.
            </p>
          </div>
        </section>

        <section className="door dark">
          <div className="dnum">Account</div>
          <h2 className="dtitle">Sign in with Google</h2>
          <p className="dsub">
            One file in your own Google Drive, written straight from this page. Your
            résumé follows you between machines, and you stay signed in.
          </p>
          <ul className="dpoints">
            <li><span className="tick">✓</span><span>Same résumé on your laptop, desktop and any browser</span></li>
            <li><span className="tick">✓</span><span>We can only see the one file we create, never the rest of your Drive</span></li>
            <li><span className="tick">✓</span><span>We never learn your name or email — we don't ask for them</span></li>
            <li><span className="cross">—</span><span className="muted">Needs a Google account and a one-time consent screen</span></li>
          </ul>
          <div className="dact">
            {googleDrive.isConfigured() ? (
              <button className="dbtn" disabled={busy} onClick={() => void withGoogle()}>
                <GoogleMark />
                {busy ? "Waiting for Google…" : "Sign in with Google"}
              </button>
            ) : (
              <p className="dfine">
                Signing in is not enabled on this deployment — no Google client id was
                built in. Carry on as a guest; everything else works.
              </p>
            )}
            {error && <p className="dError">{error}</p>}
            <p className="dfine">
              Uses the <span className="lit">drive.file</span> scope: per-file access,
              enforced by Google, limited to files this app created.
            </p>
          </div>
        </section>
      </div>

      <div className="landing-foot">
        <b>Either way, the editor is identical.</b> Start as a guest and sign in later,
        or sign out and keep working — your copies come with you, and
        signing out never deletes anything unless you ask it to.
      </div>
    </div>
  );
}
