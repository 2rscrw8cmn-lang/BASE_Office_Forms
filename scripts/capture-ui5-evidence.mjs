// Dev-only: capture UI-5 native RFI register desktop/mobile evidence from the
// built harness (dist/ui-4-evidence -- the shared UI-4/UI-5 evidence entry;
// see vite.evidence.config.ts) using the local Chrome install. Not part of CI.
//
// Unlike capture-ui4-evidence.mjs (which used Playwright's bundled Chromium),
// this drives a locally installed Chrome binary directly through its headless
// CLI screenshot mode with --virtual-time-budget, so no extra browser-testing
// dependency is required. Interactive states (open editor, saving, validation
// error, conflict) are scripted inside the harness itself
// (src/ui/app/evidence/harness.tsx's `runRfiScenario`, driven by the
// `rfiScenario` query param) using real DOM events, so a single deterministic
// screenshot after the virtual time budget elapses is enough -- no external
// click/type automation is needed here.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const execFileAsync = promisify(execFile);

const ROOT = fileURLToPath(new URL("../dist/ui-4-evidence", import.meta.url));
const OUT = fileURLToPath(new URL("../docs/evidence/ui-5", import.meta.url));

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];
const CHROME = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!CHROME) {
  console.error("No Chrome/Chromium binary found. Checked:", CHROME_CANDIDATES);
  process.exit(1);
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    const filePath = join(ROOT, normalize(pathname));
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;
const base = `http://localhost:${port}`;

// execFile (async), not execFileSync: the local HTTP server above runs in
// this SAME process/event loop. A *synchronous* child-process call would
// block that event loop while Chrome is running, so Chrome's own requests
// back to our server could never be handled -- a same-process deadlock.
async function shot(name, { width, height, query, budget = 3000 }) {
  const url = `${base}/index.html${query}`;
  const outPath = join(OUT, name);
  await execFileAsync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      `--window-size=${String(width)},${String(height)}`,
      "--hide-scrollbars",
      `--screenshot=${outPath}`,
      `--virtual-time-budget=${String(budget)}`,
      url,
    ],
    { timeout: 30000 },
  );
  console.log(`captured ${name}`);
}

const DESKTOP = { width: 1280, height: 900 };
// A real phone width (~390px) is requested, but this machine's local Chrome
// headless CLI enforces a ~500px floor on the actual layout viewport
// (`window.innerWidth`) regardless of `--window-size` -- confirmed by an
// injected `window.innerWidth`/`scrollWidth` readout, which reported 500 at
// widths requested from 280-390px alike. Below that floor, Chrome still
// renders at 500px but crops the screenshot to the smaller canvas, producing
// a misleading partial-content image rather than a true narrow reflow. 500px
// is used here instead so the capture shows the real, non-overflowing
// rendered layout (confirmed via the same readout: scrollWidth === innerWidth
// === 500, i.e. no horizontal overflow) rather than a deceptive crop.
const MOBILE = { width: 500, height: 900 };
// The 641-760px and 761-900px ranges are a real gap between the two
// breakpoints (table/cards switches at 760px; the editor collapses to one
// column at 900px) -- distinct from both the 1280px desktop shots and the
// 390px phone shot, and the exact range PR #45 review flagged as regressed.
const TABLET_NARROW = { width: 700, height: 900 };
const TABLET_WIDE = { width: 820, height: 900 };

await shot("rfi-register-desktop-populated.png", {
  ...DESKTOP,
  query: "?route=/projects/p1/rfis",
});
await shot("rfi-register-desktop-editor-open.png", {
  ...DESKTOP,
  query: "?route=/projects/p1/rfis&rfiScenario=editor-open",
});
await shot("rfi-register-desktop-validation-error.png", {
  ...DESKTOP,
  query: "?route=/projects/p1/rfis&rfiScenario=validation-error",
});
await shot("rfi-register-desktop-saving.png", {
  ...DESKTOP,
  query: "?route=/projects/p1/rfis&rfiScenario=saving&rfiPatchMode=slow",
});
await shot("rfi-register-desktop-conflict.png", {
  ...DESKTOP,
  query: "?route=/projects/p1/rfis&rfiScenario=conflict&rfiPatchMode=conflict",
  budget: 4000,
});
await shot("rfi-register-desktop-filtered-empty.png", {
  ...DESKTOP,
  query: `?route=${encodeURIComponent("/projects/p1/rfis?status=void")}`,
});
await shot("rfi-register-desktop-first-use-empty.png", {
  ...DESKTOP,
  query: "?route=/projects/p1/rfis&rfiFixture=empty",
});
await shot("rfi-register-mobile-cards.png", {
  ...MOBILE,
  query: "?route=/projects/p1/rfis",
});
await shot("rfi-register-tablet-700-table.png", {
  ...TABLET_NARROW,
  query: "?route=/projects/p1/rfis",
});
await shot("rfi-register-tablet-820-editor-open.png", {
  ...TABLET_WIDE,
  query: "?route=/projects/p1/rfis&rfiScenario=editor-open",
});

server.close();
console.log("done");
