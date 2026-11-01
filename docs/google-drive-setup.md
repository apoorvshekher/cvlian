# Enabling Google Drive sync

The app syncs each user's workspace to **their own** Google Drive. There is
no server and no shared database: the resume goes from the browser straight
to that user's Drive.

To turn it on you register one OAuth client and build the site with its id.

## 1. Create the OAuth client

1. In the [Google Cloud console](https://console.cloud.google.com/), create a
   project (free).
2. **APIs & Services → Library → Google Drive API → Enable.**
3. **OAuth consent screen** → External. Fill in the app name, support email,
   and the **privacy policy and terms URLs** — Google requires both before a
   public app can be published. Two static pages on the Pages site are enough.
4. **Scopes:** add only `.../auth/drive.file`. This is the narrow scope that
   limits the app to files it created; it avoids the restricted-scope
   security assessment. Do not add broader Drive scopes.
5. **Credentials → Create credentials → OAuth client ID → Web application.**
   Under **Authorised JavaScript origins** add:
   - `https://<user>.github.io` (origins have no path, so one entry covers
     every project on that Pages domain)
   - `http://localhost:5173` for development
   Leave **Authorised redirect URIs** empty — the token flow doesn't use one.
6. **Add yourself as a test user.** A new app starts in *Testing*, where only
   listed accounts can sign in — including the project owner. Under
   **Google Auth Platform → Audience** (older console: **OAuth consent
   screen**) → *Test users* → **Add users**, add your own address. Skipping
   this gives `Error 403: access_denied — has not completed the Google
   verification process`, which reads like a review is pending when really
   you just aren't on the list.
7. Publish the consent screen when you are ready for people other than your
   test users. Confirm Google's current verification rules at that point;
   they change, and `drive.file` being non-sensitive is what keeps this cheap.

If sign-in fails with `Error 400: origin_mismatch`, the page's origin is not
in the authorised list. Check the exact scheme, host and port in the address
bar — `localhost` and `127.0.0.1` are different origins to Google, a
trailing slash is rejected, and Vite quietly moves to 5174 when 5173 is
busy.

`Error 401: invalid_client` with the detail **"no registered origin"** is a
different fault and is easy to misread as a bad client id. The id is fine;
the client simply has **no Authorised JavaScript origins at all**. Redirect
URIs are a separate list and do not stand in for origins — the token flow
never uses one. Open **Credentials → your OAuth 2.0 Client ID** and confirm
the *Authorised JavaScript origins* box is non-empty (and that the client's
type really is *Web application*; a Desktop-app client cannot hold origins,
so it fails this way permanently). Saved origin changes take a minute or two
to propagate.

Copy the client id. It looks like `1234567890-abc.apps.googleusercontent.com`.

## 2. Build with the client id

The id is **public by design** — an identifier fenced by the authorised
origins, not a secret. There is no client secret anywhere in this flow; if a
tutorial tells you to put one in front-end code, it is describing a different
(server-side) flow.

Locally:

```bash
VITE_GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com npm run dev
```

For the deployed site, set a repository **variable** named
`GOOGLE_CLIENT_ID` (Settings → Secrets and variables → Actions → Variables);
`.github/workflows/deploy.yml` passes it to the build.

Without the variable the app still works — the Sync panel reports that this
deployment has no client id and everything else behaves normally.

## What users see

A consent screen naming your app and asking to "see, edit, create and delete
only the specific Google Drive files you use with this app". After that the
app writes `resume-editor.json` to the root of their Drive, which they can
open, download or delete themselves.

## Things worth knowing

- **Tokens last about an hour and browser flows get no refresh token.** The
  app asks for a fresh one silently on load; when Google declines, the panel
  shows "reconnect". That is normal, not a bug.
- **The token is kept in memory only.** localStorage holds a "was connected"
  flag and the Drive file id, so there is no credential on disk to steal.
- **Safari** limits silent renewal more aggressively than Chrome; expect more
  reconnect clicks there.
- **Conflicts are merged, never dropped.** If the Drive copy moved on while
  this browser was editing, the newer working copy stays live and the other
  is kept beside it as a copy of its own ("Data Scientist — from Drive").
  `node scripts/check-sync.mjs` covers those rules.
