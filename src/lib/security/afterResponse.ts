import { after } from "next/server";

/**
 * Schedule non-critical work after the response. The fallback keeps direct
 * route-handler unit tests (which have no Next request context) deterministic.
 */
export function afterResponse(task: () => Promise<void> | void): void {
  try {
    after(task);
  } catch {
    void Promise.resolve(task()).catch((error) => {
      console.error("[after-response] task failed", error);
    });
  }
}

