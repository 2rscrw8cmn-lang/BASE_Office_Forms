import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

describe("React Router 8.3 security migration", () => {
  const retiredPackage = ["react-router", "dom"].join("-");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    engines: { node: string };
    dependencies: Record<string, string>;
  };

  it("pins the patched router without the retired DOM package", () => {
    expect(packageJson.dependencies["react-router"]).toBe("8.3.0");
    expect(packageJson.dependencies[retiredPackage]).toBeUndefined();
    expect(packageJson.engines.node).toBe(">=22.22.0");
  });

  it("removes retired DOM router imports from application and test code", () => {
    const files = [
      ...walk("src/ui"),
      ...walk("tests"),
      "package.json",
      "package-lock.json",
    ].filter((file) => /\.(?:ts|tsx|json)$/.test(file));
    const offenders = files.filter((file) =>
      readFileSync(file, "utf8").includes(retiredPackage),
    );
    expect(offenders).toEqual([]);
  });

  it("pins CI to the React Router 8.3 Node baseline", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain("node-version: 22.22.0");
  });
});
