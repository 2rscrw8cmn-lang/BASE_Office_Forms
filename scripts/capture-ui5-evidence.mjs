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
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

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
async function availablePort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

function connectCdp(webSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const pending = new Map();
    let nextId = 0;
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}, sessionId) {
          nextId += 1;
          const id = nextId;
          socket.send(JSON.stringify({ id, method, params, sessionId }));
          return new Promise((resolveCommand, rejectCommand) => {
            pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
          });
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !pending.has(message.id)) return;
      const command = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) command.reject(new Error(message.error.message));
      else command.resolve(message.result);
    });
    socket.addEventListener("error", () => {
      reject(new Error("Could not connect to Chrome DevTools."));
    });
  });
}

async function emulatedShot(name, { width, height, query, budget }) {
  const url = `${base}/index.html${query}`;
  const outPath = join(OUT, name);
  const port = await availablePort();
  const profile = await mkdtemp(join(tmpdir(), "base-ui5-cdp-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      `--remote-debugging-port=${String(port)}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  let client;
  try {
    let version;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        const result = await fetch(
          `http://127.0.0.1:${String(port)}/json/version`,
        );
        if (result.ok) {
          version = await result.json();
          break;
        }
      } catch {
        // Chrome is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!version?.webSocketDebuggerUrl) {
      throw new Error("Chrome DevTools did not become ready.");
    }
    client = await connectCdp(version.webSocketDebuggerUrl);
    const target = await client.send("Target.createTarget", {
      url: "about:blank",
    });
    const attached = await client.send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
    const sessionId = attached.sessionId;
    await client.send("Page.enable", {}, sessionId);
    await client.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: true,
        screenWidth: width,
        screenHeight: height,
      },
      sessionId,
    );
    await client.send(
      "Emulation.setScrollbarsHidden",
      { hidden: true },
      sessionId,
    );
    await client.send("Page.navigate", { url }, sessionId);
    await new Promise((resolve) => setTimeout(resolve, budget));
    const viewport = await client.send(
      "Runtime.evaluate",
      {
        expression:
          "({ width: window.innerWidth, height: window.innerHeight, scrollWidth: document.documentElement.scrollWidth })",
        returnByValue: true,
      },
      sessionId,
    );
    const metrics = viewport.result.value;
    if (metrics.width !== width || metrics.height !== height) {
      throw new Error(
        `Expected ${String(width)}x${String(height)} CSS viewport, got ${String(metrics.width)}x${String(metrics.height)}.`,
      );
    }
    if (metrics.scrollWidth > width) {
      throw new Error(
        `Mobile layout overflowed: ${String(metrics.scrollWidth)}px content in ${String(width)}px viewport.`,
      );
    }
    const capture = await client.send(
      "Page.captureScreenshot",
      { format: "png", fromSurface: true, captureBeyondViewport: false },
      sessionId,
    );
    await writeFile(outPath, capture.data, "base64");
    await client.send("Target.closeTarget", { targetId: target.targetId });
    console.log(
      `captured ${name} (${String(width)}x${String(height)} CSS viewport)`,
    );
  } finally {
    client?.close();
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill();
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await rm(profile, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }
}

async function shot(name, { width, height, query, budget = 3000, emulate }) {
  if (emulate) {
    await emulatedShot(name, { width, height, query, budget });
    return;
  }
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
const MOBILE_390 = {
  width: 390,
  height: 844,
  emulate: true,
};
const MOBILE_430 = {
  width: 430,
  height: 932,
  emulate: true,
};
const TABLET = { width: 768, height: 1024 };
const TABLET_WIDE = { width: 820, height: 900 };

await shot("rfi-register-desktop-populated.png", {
  ...DESKTOP,
  query: "?route=/projects/p1/rfis",
});
await shot("rfi-register-desktop-actions-menu.png", {
  ...DESKTOP,
  query: "?route=/projects/p1/rfis&rfiScenario=action-menu",
});
await shot("rfi-register-desktop-new-draft.png", {
  ...DESKTOP,
  query: "?route=/projects/p1/rfis&rfiScenario=new-draft",
});
await shot("rfi-register-desktop-existing-draft.png", {
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
await shot("rfi-register-mobile-390-cards.png", {
  ...MOBILE_390,
  query: "?route=/projects/p1/rfis",
});
await shot("rfi-register-mobile-390-filters-open.png", {
  ...MOBILE_390,
  query: `?route=${encodeURIComponent("/projects/p1/rfis?status=draft")}&rfiScenario=mobile-filters`,
});
await shot("rfi-register-mobile-390-drawer.png", {
  ...MOBILE_390,
  query: "?route=/projects/p1/rfis&rfiScenario=additional-collapsed",
});
await shot("rfi-register-mobile-430-additional-collapsed.png", {
  ...MOBILE_430,
  query: "?route=/projects/p1/rfis&rfiScenario=additional-collapsed",
});
await shot("rfi-register-mobile-430-additional-expanded.png", {
  ...MOBILE_430,
  query: "?route=/projects/p1/rfis&rfiScenario=additional-expanded",
});
await shot("rfi-register-tablet-768-drawer.png", {
  ...TABLET,
  query: "?route=/projects/p1/rfis&rfiScenario=editor-open",
});
await shot("rfi-register-tablet-820-drawer.png", {
  ...TABLET_WIDE,
  query: "?route=/projects/p1/rfis&rfiScenario=editor-open",
});

server.close();
console.log("done");
