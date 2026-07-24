import { describe, expect, it } from "vitest";
import { defaultShellRuntime } from "../../src/ui/app/featureRuntime";

/*
 * defaultShellRuntime.getApiClient() imports the statically-served
 * public/app-api.js module at runtime. In this test environment that import
 * always rejects (there is no server backing an absolute "/app-api.js"
 * specifier), which is exactly what lets this test prove the fix
 * deterministically: the module must not cache a rejected import promise
 * forever. Before the fix, a second call after the first rejection returned
 * the SAME promise reference (since `apiClientPromise ??= …` only assigns when
 * the variable is null/undefined, and a settled-but-rejected promise is
 * neither); every future caller would be stuck awaiting that one rejection
 * for the page's entire lifetime. After the fix, the rejection handler resets
 * the cache to null, so the next call starts a genuinely fresh import.
 */
describe("featureRuntime getApiClient() rejection caching", () => {
  it("does not permanently cache a rejected getApiClient() promise", async () => {
    const first = defaultShellRuntime.getApiClient();
    await expect(first).rejects.toBeTruthy();

    const second = defaultShellRuntime.getApiClient();
    expect(second).not.toBe(first);
    await expect(second).rejects.toBeTruthy();

    const third = defaultShellRuntime.getApiClient();
    expect(third).not.toBe(second);
    await expect(third).rejects.toBeTruthy();
  });
});
