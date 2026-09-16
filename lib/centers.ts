import { env } from "cloudflare:workers";

export type CenterEnv = { DB?: D1Database; ECG_BUCKET?: R2Bucket };

export function getCenterEnv(): CenterEnv {
  return env as unknown as CenterEnv;
}

export function centerError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected database error";
  if (message.includes("no such table") || message.includes("centers")) {
    return "Center directory is not initialized. Deploy the generated D1 migration before using center accounts.";
  }
  return "Center directory is temporarily unavailable.";
}

export function safeStatus(status: unknown): "new" | "acknowledged" | "closed" {
  return status === "acknowledged" || status === "closed" ? status : "new";
}
