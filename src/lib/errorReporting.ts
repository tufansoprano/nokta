import { capturePostHogException } from "@/lib/posthogClient";

export type ErrorContext = Record<string, string | number | boolean | null | undefined>;

/**
 * For errors the app catches and recovers from, so they still reach PostHog error
 * tracking. Uncaught errors are picked up by the SDK on its own.
 *
 * `context` says where the error came from. Ids are fine; names, emails and
 * message bodies are not.
 */
export function reportError(error: unknown, context?: ErrorContext): void {
  try {
    capturePostHogException(error, context);
    if (import.meta.env.DEV) console.error("[error]", context ?? {}, error);
  } catch {
    return;
  }
}
