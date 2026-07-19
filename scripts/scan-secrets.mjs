import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const trackedFiles = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  {
    encoding: "utf8",
  },
)
  .split("\0")
  .filter(Boolean)
  .filter((file) => file !== "package-lock.json");

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
];

const findings = [];
for (const file of trackedFiles) {
  let contents;
  try {
    contents = await readFile(file, "utf8");
  } catch {
    continue;
  }

  const lines = contents.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (secretPatterns.some((pattern) => pattern.test(line))) {
      findings.push(`${file}:${index + 1}`);
    }
  });
}

if (findings.length > 0) {
  throw new Error(
    `Potential committed secret detected at ${findings.join(", ")}`,
  );
}

console.log(
  `Secret scan passed (${trackedFiles.length} tracked files checked)`,
);
