/// <reference types="vite/client" />

interface ImportMetaEnv {
  /* OAuth client id for the Google Drive sync provider. Public by design:
   * it is an identifier, fenced by the authorised JavaScript origins on
   * the Google Cloud console, not a secret. Empty in dev, which makes the
   * provider report itself unconfigured instead of offering a dead button. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
