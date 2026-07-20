import type { D1Migration } from "cloudflare:test";

export {};

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
