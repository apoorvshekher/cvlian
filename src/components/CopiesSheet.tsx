import { useState } from "react";
import type { Store } from "../types";

import type { SyncProvider } from "../sync/provider";
import type { SyncState } from "../sync/useSync";
import { ConfirmStrip, InlineName } from "./controls";
import { PagePreview, PageSketch } from "./PagePreview";
import { BranchIcon, LayersIcon, PlusIcon, ShieldIcon, XIcon } from "./icons";

/* The copies of this résumé, as one sheet.
 *
 * Three rules do most of the work here: a copy is shown as a PAGE so you can
 * tell them apart; LOOKING at a copy is not switching to it, so you can read
 * one while editing another; and each copy says where it came from, so the
 * tree is visible without drawing a graph at anybody. A copy keeps no saved
 * versions — there is the copy as it stands, and the master it draws from. */

type Ask =
  | null
  | { kind: "new" }
  | { kind: "rename" }
  | { kind: "deleteCopy" }
  | { kind: "signout" };

const PHASE: Record<SyncState["phase"], string> = {
  off: "Working as a guest — kept in this browser",
  connecting: "Connecting to your Drive…",
  idle: "Signed in · everything is in your Drive",
  syncing: "Signed in · saving to your Drive…",
  behind: "Signed in · saves to your Drive on your next Compile",
  error: "Signed in, but Drive didn't answer — it will try again on your next Compile",
};

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mins = (Date.now() - d.getTime()) / 60000;
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.floor(mins)} min ago`;
  if (mins < 60 * 18) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (mins < 60 * 24 * 7) return d.toLocaleString(undefined, { weekday: "long", hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function CopiesSheet({
  store,
  onSwitch,
  onNewCopy,
  onRenameCopy,
  onDeleteCopy,
  masterId,
  onMakeMaster,
  syncProvider,
  syncState,
  signedIn,
  onSyncConnect,
  onSyncNow,
  onSignOut,
  openSignOut,
  onClose,
}: {
  store: Store | null;
  onSwitch: (id: string) => void;
  onNewCopy: (fromId: string, name: string) => void;
  onRenameCopy: (id: string, name: string) => void;
  onDeleteCopy: (id: string) => void;
  masterId?: string;
  onMakeMaster: (id: string) => void;
  syncProvider: SyncProvider;
  syncState: SyncState;
  signedIn: boolean;
  onSyncConnect: () => void;
  onSyncNow: () => void;
  onSignOut: () => void;
  openSignOut?: boolean;
  onClose: () => void;
}) {
  const copies = store?.branches ?? [];
  const activeId = store?.activeId ?? "";
  /* which copy you are READING. It starts on the one you are editing and
   * moves independently of it — that is the whole point. */
  const [lookingId, setLookingId] = useState(activeId);
  const [ask, setAsk] = useState<Ask>(openSignOut ? { kind: "signout" } : null);

  const copy = copies.find((b) => b.id === lookingId) ?? copies.find((b) => b.id === activeId) ?? copies[0];
  const master = copies.find((b) => b.id === masterId) ?? copies[0];
  const isMaster = !!copy && copy.id === master?.id;
  const isActive = copy?.id === activeId;
  const clear = () => setAsk(null);

  const look = (id: string) => {
    setLookingId(id);
    clear();
  };

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sh-head">
          <h1>Your résumé</h1>
          <span className="sub">{copies.length === 1 ? "one copy" : `${copies.length} copies`}</span>
          <span className="spacer" />
          <button className="icobtn" title="Close" onClick={onClose}><XIcon /></button>
        </div>

        <div className="sh-body">
          {/* ---------- the copies ---------- */}
          <div className="copies">
            <div className="cl-label">Copies of this résumé</div>

            {copies.map((b) => (
              <button
                key={b.id}
                className={"ccard" + (b.id === copy?.id ? " sel" : "")}
                onClick={() => look(b.id)}
              >
                <PageSketch data={b.data} />
                <span className="ct">
                  <span className="cn">
                    <span className="cname">{b.name}</span>
                    {b.id === master?.id && <span className="mtag">master</span>}
                    {b.id === activeId && <span className="livetag">editing now</span>}
                  </span>
                  <span className="cm">{when(b.updatedAt)}</span>
                  {b.id === master?.id && (
                    <span className="cfrom">
                      <LayersIcon />
                      everything you have written
                    </span>
                  )}
                  {b.origin && (
                    <span className="cfrom">
                      <BranchIcon />
                      {b.origin}
                    </span>
                  )}
                </span>
              </button>
            ))}

            {ask?.kind === "new" ? (
              <div className="ccard ask">
                <InlineName
                  action="Create"
                  placeholder="Data Scientist, Frontend, …"
                  onCommit={(name) => {
                    onNewCopy(copy?.id ?? activeId, name);
                    /* creating switches the editor to it; follow it here too */
                    setLookingId("");
                    clear();
                  }}
                  onCancel={clear}
                />
              </div>
            ) : (
              <button className="cadd" onClick={() => setAsk({ kind: "new" })}>
                <PlusIcon />
                Tailor one for a job
              </button>
            )}

            <p className="cnote">
              A copy is a whole résumé of its own — one per job worth rewording for. Editing one
              never touches another.
            </p>
          </div>

          {/* ---------- the copy you are reading ---------- */}
          {copy && (
            <div className="detail">
              <div className="dt-head">
                <span className="dt-title">
                  {ask?.kind === "rename" ? (
                    <InlineName
                      action="Rename"
                      initial={copy.name}
                      onCommit={(name) => { onRenameCopy(copy.id, name); clear(); }}
                      onCancel={clear}
                    />
                  ) : (
                    <span className="dt-name">{copy.name}</span>
                  )}
                  <span className="dt-for">
                    {isMaster
                      ? "Everything you have ever written, in one place. You cut it down into a copy — this one is not for sending."
                      : isActive
                        ? "This is the one you are editing."
                        : <>You are editing <b>{copies.find((b) => b.id === activeId)?.name}</b> — looking here changes nothing.</>}
                  </span>
                </span>
                <span className="spacer" />
                {!isActive && (
                  <button className="btn primary" onClick={() => { onSwitch(copy.id); onClose(); }}>
                    Edit this one
                  </button>
                )}
                {ask?.kind !== "rename" && (
                  <button className="btn" onClick={() => setAsk({ kind: "rename" })}>Rename</button>
                )}
                {!isMaster && (
                  <button className="btn ghost" title="Make this the copy nothing is cut out of" onClick={() => onMakeMaster(copy.id)}>
                    Make this the master
                  </button>
                )}
                {copies.length > 1 && !isMaster && (
                  <button className="btn ghost danger" onClick={() => setAsk({ kind: "deleteCopy" })}>
                    Delete
                  </button>
                )}
              </div>

              {ask?.kind === "deleteCopy" && (
                <ConfirmStrip
                  question={`Delete "${copy.name}"?`}
                  onConfirm={() => { onDeleteCopy(copy.id); look(activeId); }}
                  onCancel={clear}
                />
              )}

              <div className="dt-body">
                <div className="viewer">
                  <div className="pagewrap">
                    <PagePreview data={copy.data} />
                  </div>
                  <div className="vcap">
                    <b>Last edited</b> · {when(copy.updatedAt)}
                  </div>
                </div>

                <div className="hist">
                  <div className="h-top">
                    <span className="h-label">What's in it</span>
                  </div>

                  <div className="h-list">
                    {/* Your details is pooled on the same terms as any
                        section, so it is listed like one — and it is row 01
                        of the editor's index for that reason. */}
                    <div className="hrow">
                      <i className="hdot" />
                      <span className="htx">
                        <span className="h1l"><span className="nm">Your details</span></span>
                        <span className="h2l">
                          {copy.data.personal.contacts.length === 1
                            ? "1 way to reach you"
                            : `${copy.data.personal.contacts.length} ways to reach you`}
                        </span>
                      </span>
                    </div>
                    {copy.data.sections.map((sec) => (
                      <div className="hrow" key={sec.id}>
                        <i className="hdot" />
                        <span className="htx">
                          <span className="h1l"><span className="nm">{sec.title || "Untitled"}</span></span>
                          <span className="h2l">
                            {sec.entries.length === 1 ? "1 entry" : `${sec.entries.length} entries`}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>

                  {isMaster && !copy.data.sections.length && (
                    <div className="empty">
                      <b>Nothing in it yet.</b>
                      <p>
                        Write a section here, or write one while tailoring a copy — anything new in
                        a copy joins the master on its next compile.
                      </p>
                    </div>
                  )}

                  <div className="promise">
                    {isMaster ? (
                      <>
                        <LayersIcon />
                        <span>
                          <b>Every copy adds to it.</b> Anything new written in a copy joins the
                          master at the next compile; a rewording stays in the copy it was written for.
                          Delete something here and it leaves every copy too.
                        </span>
                      </>
                    ) : (
                      <>
                        <ShieldIcon />
                        <span>
                          <b>What you add here reaches the master</b> at the next compile, so cutting
                          it from this copy later loses nothing. A rewording stays in this copy.
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ---------- where all of this is kept ---------- */}
        <div className="sh-foot">
          {ask?.kind === "signout" ? (
            <ConfirmStrip
              question={
                syncState.phase === "idle" && syncState.lastSyncedAt
                  ? `Sign out? Your résumé is removed from this browser. Your Drive has it as of ${when(syncState.lastSyncedAt)}, so signing back in brings it home.`
                  : "Sign out? Your résumé is removed from this browser. Drive has not confirmed a save yet — use Sync now first if you are unsure."
              }
              action="Sign out"
              cancel="Stay signed in"
              onConfirm={onSignOut}
              onCancel={clear}
            />
          ) : (
            <>
              <i className={"sync-dot " + syncState.phase} />
              <span className="fphase">
                {syncProvider.isConfigured() ? PHASE[syncState.phase] : "Kept in this browser — signing in is off in this build"}
              </span>
              {syncState.message && <span className="ferr">{syncState.message}</span>}
              <span className="spacer" />
              {signedIn ? (
                <>
                  {/* Google only hands over a token from a click, so after a
                      reload this button is the click — not "sync now". */}
                  {syncState.phase === "behind" || syncState.phase === "error" ? (
                    <button className="btn sm primary" onClick={onSyncConnect}>Sync now</button>
                  ) : (
                    <button className="btn sm" onClick={onSyncNow}>Sync now</button>
                  )}
                  <button className="btn sm ghost danger" onClick={() => setAsk({ kind: "signout" })}>Sign out</button>
                </>
              ) : syncProvider.isConfigured() ? (
                <button className="btn sm primary" onClick={onSyncConnect}>Sign in with Google</button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
