import type { Branch, Removal, Store } from "../types";

/* What a provider stores: the whole workspace, the same shape Export
 * writes, so a synced file and a downloaded backup are interchangeable. */
export interface SyncPayload {
  savedAt: string;
  activeId: string;
  masterId?: string;
  branches: Branch[];
  removed?: Removal[];
}

/* A remote revision marker. Providers define their own format; the sync
 * layer only ever compares it for equality. */
export type Rev = string;

export interface RemoteState {
  payload: SyncPayload;
  rev: Rev;
}

/* The one failure the UI must not read as a breakage: the provider is fine,
 * it just has no live session. Getting a new one means a popup, and a popup
 * may only follow a click, so the sync layer parks rather than retrying. */
export class AuthNeededError extends Error {
  readonly needsAuth = true;
}

export function isAuthNeeded(err: unknown): boolean {
  return (err as { needsAuth?: boolean } | null)?.needsAuth === true;
}

/* Storage back ends implement this and nothing else knows about them.
 * Everything is allowed to throw; callers surface the message. */
export interface SyncProvider {
  readonly id: string;
  readonly name: string;
  /* One line for the UI explaining where the data goes. */
  readonly blurb: string;
  /* False when the deployment has no credentials for this provider — the
   * UI then explains how to configure it instead of offering a dead button. */
  isConfigured(): boolean;
  /* Whether a previous session left us connected (no network check). */
  wasConnected(): boolean;
  /* Whether a token is in hand right now, so Drive can be reached without
   * opening a window. False means the next write has to wait for a click. */
  hasToken(): boolean;
  /* Sign-in. `silent` means "resume without any UI" and resolves false when
   * that is not possible — it must never open a window, since page load is
   * one of its callers. A false is a prompt to offer a button, not an error. */
  connect(silent?: boolean): Promise<boolean>;
  disconnect(): Promise<void>;
  /* null when nothing has been stored remotely yet. */
  load(): Promise<RemoteState | null>;
  save(payload: SyncPayload): Promise<Rev>;
  /* Human-readable target, e.g. the file name. */
  describeTarget(): string;
}

export function toPayload(store: Store): SyncPayload {
  return {
    savedAt: new Date().toISOString(),
    activeId: store.activeId,
    masterId: store.masterId,
    branches: store.branches,
    removed: store.removed,
  };
}
