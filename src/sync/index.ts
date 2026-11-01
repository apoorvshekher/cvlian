import { googleDrive } from "./googleDrive";
import type { SyncProvider } from "./provider";

/* Storage back ends the app can sync to. Adding one means implementing
 * SyncProvider and listing it here — nothing else in the app changes. */
export const PROVIDERS: SyncProvider[] = [googleDrive];

export const getProvider = (id: string): SyncProvider | undefined =>
  PROVIDERS.find((p) => p.id === id);

export { mergeStores } from "./merge";
export { toPayload } from "./provider";
export type { SyncPayload, SyncProvider } from "./provider";
