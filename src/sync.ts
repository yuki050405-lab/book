import { State, mergeStates } from "./model";
import { readCloud, syncSheets, writeCloud } from "./services";

export type SyncResult = { state: State; sheetError: string };

/** Sheets failure must not prevent the library from being shared through Drive. */
export async function syncLibrary(
  local: State,
  force = false,
): Promise<SyncResult> {
  const remote = await readCloud();
  const merged = remote ? mergeStates(local, remote) : local;
  const changed =
    !remote ||
    JSON.stringify([merged.books, merged.shelves]) !==
      JSON.stringify([remote.books, remote.shelves]);
  let sheetError = "";
  if (changed || local.dirty || force) {
    try {
      await syncSheets(merged.books);
    } catch (error) {
      sheetError = (error as Error).message;
    }
    await writeCloud(merged);
  }
  return {
    state: {
      ...merged,
      lastSync: new Date().toISOString(),
      dirty: Boolean(sheetError),
    },
    sheetError,
  };
}
