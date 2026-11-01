import { useRef } from "react";
import { PlusIcon, XIcon } from "./icons";

/* The sample résumé is on screen the moment anyone arrives, with nothing
 * saying whose it is or what to do with it. One strip, three ways forward,
 * and it never comes back once it has been answered. */
export function FirstRunStrip({
  onMakeMine,
  onImportFile,
  onStartEmpty,
  onDismiss,
}: {
  onMakeMine: () => void;
  onImportFile: (file: File) => void;
  onStartEmpty: () => void;
  onDismiss: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="greet">
      <div className="greet-text">
        <strong>This is a sample, so there is something on the page to look at.</strong>
        <p>Pick how you would rather start — or just begin typing, and this goes away for good.</p>
      </div>
      <div className="greet-acts">
        <button className="btn primary" onClick={onMakeMine}>Make it mine</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Import one I have</button>
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
        <button className="btn ghost" onClick={onStartEmpty}>
          <PlusIcon />
          Start empty
        </button>
        <button className="iconbtn" title="Dismiss" onClick={onDismiss}><XIcon /></button>
      </div>
    </div>
  );
}
