import { randomBytes } from "crypto";

/**
 * Turns a caught error into something safe to hand back to a browser.
 *
 * Route handlers used to interpolate the error straight into the response
 * (`` `... ${error}` ``), which shipped Mongoose validation internals, driver
 * messages and occasionally connection details to whoever triggered the fault.
 * This keeps the human-readable part, logs the real error server-side under a
 * short reference, and returns only that reference to the caller — enough to
 * match a user report to a log line, useless to someone probing for internals.
 */
export function apiErrorMessage(userMessage: string, error: unknown): string {
  const reference = randomBytes(4).toString("hex");
  console.error(`[api:${reference}] ${userMessage}`, error);
  return `${userMessage} (mã lỗi: ${reference})`;
}
