import { ROOT_PATH } from "util/rootPath";

/**
 * Whether this server ships the HTML documentation under /documentation/.
 *
 * incusd serves it from INCUS_DOCUMENTATION, which is not set (or points at a path that does
 * not exist) on source builds and minimal installs. The UI probes once per session and hides
 * documentation links instead of sending people to a 404.
 */
const PROBE = `${ROOT_PATH}/documentation/objects.inv.txt`;

let probe: Promise<boolean> | null = null;

export const documentationAvailable = (): Promise<boolean> => {
  probe ??= fetch(PROBE, { method: "HEAD" })
    .then((response) => response.ok)
    .catch(() => false);

  return probe;
};
