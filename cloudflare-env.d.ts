declare namespace Cloudflare {
  interface Env {
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    DB?: D1Database;
    ECG_BUCKET?: R2Bucket;
  }
}
