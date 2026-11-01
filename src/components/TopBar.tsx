import { useRef, useState } from "react";
import type { Branch, Store } from "../types";
import { CopiesSheet } from "./CopiesSheet";
import type { SyncProvider } from "../sync/provider";
import type { SyncState } from "../sync/useSync";
import { ChevronDownIcon, DownloadIcon, GoogleMark, MoonIcon, SunIcon } from "./icons";

export interface Status {
  text: string;
  cls?: string;
  /* the mechanical detail — compile time, the raw error — on hover only */
  title?: string;
}

const DRIVE_LABEL: Record<SyncState["phase"], string> = {
  off: "Drive",
  connecting: "Connecting to Drive…",
  idle: "In Drive",
  syncing: "Saving to Drive…",
  behind: "Saves to Drive on Compile",
  error: "Drive didn't answer",
};

export function TopBar({
  store,
  branch,
  status,
  pdfReady,
  theme,
  onSwitch,
  onNewCopy,
  onRenameCopy,
  onDeleteCopy,
  masterId,
  onMakeMaster,
  syncProvider,
  syncState,
  onSyncConnect,
  onSyncNow,
  signedIn,
  onSignIn,
  onSignOut,
  onCompile,
  onDownload,
  onExport,
  onImportFile,
  onToggleTheme,
}: {
  store: Store | null;
  branch: Branch | null;
  status: Status;
  pdfReady: boolean;
  theme: "light" | "dark";
  onSwitch: (id: string) => void;
  onNewCopy: (fromId: string, name: string) => void;
  onRenameCopy: (id: string, name: string) => void;
  onDeleteCopy: (id: string) => void;
  masterId?: string;
  onMakeMaster: (id: string) => void;
  syncProvider: SyncProvider;
  syncState: SyncState;
  onSyncConnect: () => void;
  onSyncNow: () => void;
  signedIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onCompile: () => void;
  onDownload: () => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  onToggleTheme: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  /* Sign out lives in the panel with every other confirmation, so the button
   * here opens the panel already asking rather than growing its own popover. */
  const [askSignOut, setAskSignOut] = useState(false);
  const closePanel = () => { setPanelOpen(false); setAskSignOut(false); };

  return (
    <header className="topbar">
      <div className="brand">
        <h1>CV<i>Lian</i></h1>
      </div>

      {/* the résumé's own name, and which copy of it you are in — one button,
          because "where is my work" should have one answer */}
      <button
        className={"docchip" + (panelOpen ? " on" : "")}
        title="Copies of this résumé, and where it is kept"
        onClick={() => setPanelOpen(!panelOpen)}
      >
        <span className="dc-name">{branch?.data.personal.name || "Untitled résumé"}</span>
        <span className="dc-copy">{branch?.name}</span>
        <ChevronDownIcon />
      </button>

      {panelOpen && (
        <CopiesSheet
          store={store}
          onSwitch={onSwitch}
          onNewCopy={onNewCopy}
          onRenameCopy={onRenameCopy}
          onDeleteCopy={onDeleteCopy}
          masterId={masterId}
          onMakeMaster={onMakeMaster}
          syncProvider={syncProvider}
          syncState={syncState}
          signedIn={signedIn}
          onSyncConnect={onSyncConnect}
          onSyncNow={onSyncNow}
          onSignOut={onSignOut}
          openSignOut={askSignOut}
          onClose={closePanel}
        />
      )}

      <span className={"status" + (status.cls ? " " + status.cls : "")} title={status.title}>
        <i className="status-dot" />
        {status.text}
      </span>

      <div className="actions">
        {signedIn ? (
          <>
            <button
              className={"btn ghost sync-btn " + syncState.phase}
              title="Where this résumé is kept"
              onClick={() => { setAskSignOut(false); setPanelOpen(!panelOpen); }}
            >
              <i className={"sync-dot " + syncState.phase} />
              {DRIVE_LABEL[syncState.phase]}
            </button>
            <button
              className="btn ghost"
              title="Sign out of Google"
              onClick={() => { setAskSignOut(true); setPanelOpen(true); }}
            >
              Sign out
            </button>
          </>
        ) : (
          <button className="btn ghost signin" title="Keep this résumé in your own Google Drive" onClick={onSignIn}>
            <GoogleMark />
            Sign in
          </button>
        )}
        <button className="btn ghost" title="Download every copy as one JSON backup" onClick={onExport}>
          Export
        </button>
        <button
          className="btn ghost"
          title="Import a résumé, or a backup you exported before"
          onClick={() => fileRef.current?.click()}
        >
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImportFile(f);
            e.target.value = "";
          }}
        />
        <span className="v-sep" />
        <button className="btn" disabled={!pdfReady} onClick={onDownload}>
          <DownloadIcon /> PDF
        </button>
        <button className="btn primary compile" title="Build the page and save your work" onClick={onCompile}>
          Compile <kbd>Ctrl+S</kbd>
        </button>
        <span className="v-sep" />
        <button className="iconbtn" title="Toggle dark mode" onClick={onToggleTheme}>
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </header>
  );
}
