import { AuthNeededError, type RemoteState, type SyncPayload, type SyncProvider } from "./provider";

/* Google Drive, browser-only.
 *
 * Uses Google Identity Services' token client: a popup hands an access
 * token straight to this page, so there is no backend and no client
 * secret — the client id is a public identifier fenced by the authorised
 * JavaScript origins on the Cloud console.
 *
 * The scope is drive.file, which Google restricts to files this app
 * created. It cannot see anything else in the user's Drive, and that is
 * enforced by Google rather than by this code.
 *
 * The access token expires in about an hour and lives in sessionStorage
 * (see TOKEN_KEY), so a script on this origin could read it; what bounds
 * that is the scope, which reaches this app's one file and nothing else.
 * localStorage keeps just a "we were connected" flag and the file id. */

const GIS_SRC = "https://accounts.google.com/gsi/client";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FILE_NAME = "resume-editor.json";
const STATE_KEY = "resume-sync-google";

const CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim();

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface TokenClient {
  callback: (r: TokenResponse) => void;
  requestAccessToken: (opts?: { prompt?: string }) => void;
}
interface GisGlobal {
  accounts?: {
    oauth2?: {
      initTokenClient: (o: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
      }) => TokenClient;
      revoke: (token: string, done?: () => void) => void;
    };
  };
}

interface Persisted {
  connected: boolean;
  fileId?: string;
}

function readState(): Persisted {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? "{}") as Partial<Persisted>;
    return { connected: saved.connected === true, fileId: saved.fileId };
  } catch {
    return { connected: false };
  }
}

function writeState(next: Persisted): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
  } catch {
    /* quota — the flag is a convenience, not a requirement */
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Could not load Google sign-in")));
      if ((window as unknown as { google?: GisGlobal }).google?.accounts?.oauth2) resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = GIS_SRC;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Could not load Google sign-in (offline or blocked)"));
    document.head.append(el);
  });
  return scriptPromise;
}

/* The token lives in sessionStorage: one tab, gone when the tab closes, and
 * it survives a reload — the one case a click cannot help with, because
 * asking Google at page load is a popup nobody made. It used to live in a
 * variable; the added exposure is a script on this origin reading a token
 * it could just as well request itself. */
const TOKEN_KEY = "resume-sync-google-token";
let client: TokenClient | null = null;

function readToken(): { t: string; exp: number } | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { t?: unknown; exp?: unknown };
    return typeof o.t === "string" && typeof o.exp === "number" ? { t: o.t, exp: o.exp } : null;
  } catch {
    return null;
  }
}

function writeToken(t: string | null, exp = 0): void {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ t, exp }));
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode — the token then lasts as long as this page does */
  }
}

async function getClient(): Promise<TokenClient> {
  await loadGis();
  const gis = (window as unknown as { google?: GisGlobal }).google?.accounts?.oauth2;
  if (!gis) throw new Error("Google sign-in unavailable");
  if (!client) {
    client = gis.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, callback: () => {} });
  }
  return client;
}

function liveToken(): string | null {
  const saved = readToken();
  return saved && Date.now() < saved.exp ? saved.t : null;
}

/* Asks Google for a token. This ALWAYS opens a window: the browser token
 * flow has no silent refresh, and `prompt: ""` only means "skip the consent
 * screen if you can", not "no popup". So it may only ever be called from a
 * click — at page load it is an unasked-for popup, and one most browsers
 * block outright. Resuming a previous session is liveToken(), not this. */
async function requestToken(): Promise<boolean> {
  const c = await getClient();
  return new Promise<boolean>((resolve, reject) => {
    c.callback = (r) => {
      if (r.access_token) {
        writeToken(r.access_token, Date.now() + (r.expires_in ?? 3600) * 1000 - 60_000);
        resolve(true);
      } else {
        reject(new Error(r.error ? `Google sign-in failed: ${r.error}` : "Google sign-in was dismissed"));
      }
    };
    try {
      /* "" lets Google reuse the existing grant, so a reconnect is usually
       * a window that closes by itself; "consent" would re-ask every time. */
      c.requestAccessToken({ prompt: "" });
    } catch (err) {
      reject(err as Error);
    }
  });
}

function auth(): string {
  const live = liveToken();
  if (!live) throw new AuthNeededError("Google needs you to sign in again");
  return live;
}

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const bearer = auth();
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${bearer}` },
  });
  if (res.status === 401) {
    writeToken(null);
    throw new AuthNeededError("Google needs you to sign in again");
  }
  if (!res.ok) {
    throw new Error(`Drive error ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }
  return res;
}

interface DriveFile {
  id: string;
  version?: string;
  modifiedTime?: string;
}

async function findFile(): Promise<DriveFile | null> {
  const q = encodeURIComponent(`name = '${FILE_NAME}' and trashed = false`);
  const res = await api(
    `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,version,modifiedTime)&pageSize=1`,
  );
  const body = (await res.json()) as { files?: DriveFile[] };
  return body.files?.[0] ?? null;
}

export const googleDrive: SyncProvider = {
  id: "google-drive",
  name: "Google Drive",
  blurb: `Keeps ${FILE_NAME} in your own Drive. This app can only see the file it created.`,

  isConfigured: () => CLIENT_ID.length > 0,
  wasConnected: () => readState().connected,
  hasToken: () => liveToken() !== null,
  describeTarget: () => FILE_NAME,

  async connect(silent = false) {
    if (!CLIENT_ID) throw new Error("This deployment has no Google client id configured");
    /* A token already in hand is the session: it is also the only thing a
     * silent connect can ever succeed with, since asking Google means a
     * popup. The token sits in sessionStorage so a reload inside the hour
     * comes back with no window at all; after that the hook parks as
     * "behind" and the next Compile asks — never page load. */
    if (liveToken()) {
      writeState({ ...readState(), connected: true });
      return true;
    }
    if (silent) return false;
    const ok = await requestToken();
    if (ok) writeState({ ...readState(), connected: true });
    return ok;
  },

  async disconnect() {
    const gis = (window as unknown as { google?: GisGlobal }).google?.accounts?.oauth2;
    const t = liveToken();
    if (t && gis) gis.revoke(t);
    writeToken(null);
    writeState({ connected: false });
  },

  async load(): Promise<RemoteState | null> {
    const file = await findFile();
    if (!file) return null;
    writeState({ ...readState(), fileId: file.id });
    const res = await api(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
    const payload = (await res.json()) as SyncPayload;
    return { payload, rev: String(file.version ?? file.modifiedTime ?? "") };
  },

  async save(payload: SyncPayload) {
    const body = JSON.stringify(payload, null, 2);
    const existing = readState().fileId ? { id: readState().fileId as string } : await findFile();

    if (existing) {
      const res = await api(
        `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media&fields=id,version`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body },
      );
      const saved = (await res.json()) as DriveFile;
      writeState({ ...readState(), fileId: saved.id });
      return String(saved.version ?? "");
    }

    // first save: multipart so the metadata and the content go together
    const boundary = "resume-" + Math.random().toString(16).slice(2);
    const multipart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: FILE_NAME, mimeType: "application/json" }) +
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const res = await api(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,version",
      { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: multipart },
    );
    const saved = (await res.json()) as DriveFile;
    writeState({ connected: true, fileId: saved.id });
    return String(saved.version ?? "");
  },
};
