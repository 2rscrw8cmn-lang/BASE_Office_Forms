// Dev-only deterministic UI-6B evidence capture. Builds are served from the
// shared application-shell evidence artifact and the real
// `/projects/:projectId/records` React route is driven through fixtures in
// src/ui/app/evidence/harness.tsx -- production components only, no static
// mock markup. Every capture asserts the CSS viewport it claims and fails if
// the page overflows horizontally.
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { extname, join, normalize } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../dist/ui-4-evidence", import.meta.url));
const OUT = fileURLToPath(new URL("../docs/evidence/ui-6b", import.meta.url));
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!CHROME) {
  throw new Error(
    `No Chrome/Chromium binary found. Checked: ${CHROME_CANDIDATES.join(", ")}`,
  );
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

await mkdir(OUT, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, "http://localhost");
    const pathname =
      requestUrl.pathname === "/"
        ? "/index.html"
        : decodeURIComponent(requestUrl.pathname);
    const filePath = join(ROOT, normalize(pathname));
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("not found");
  }
});

await new Promise((resolve) => server.listen(0, resolve));
const serverAddress = server.address();
const serverPort =
  typeof serverAddress === "object" && serverAddress ? serverAddress.port : 0;
const baseUrl = `http://localhost:${String(serverPort)}`;

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

      const command = pending.get(message.id);
      if (!command) return;
      pending.delete(message.id);
      if (message.error) command.reject(new Error(message.error.message));
      else command.resolve(message.result);
    });
    socket.addEventListener("error", () => {
      reject(new Error("Could not connect to Chrome DevTools."));
    });
  });
}

/**
 * Each capture waits for a selector that only exists once the real React
 * feature has reached the state being documented, rather than sleeping for a
 * fixed budget. A slow machine then produces the same screenshot as a fast one
 * instead of a loading skeleton, and a state that never arrives fails the run
 * loudly rather than being captured silently half-rendered.
 */
async function capture(name, { width, height, query, expect, settle = 400 }) {
  const debugPort = await availablePort();
  const profile = await mkdtemp(join(tmpdir(), "base-ui6b-cdp-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      // Headless Chrome treats an unfocused/occluded tab as backgrounded and
      // throttles its timers and rendering, which leaves React Query's
      // in-flight requests unsettled and captures a permanent loading
      // skeleton. These keep the harness running at full speed so each
      // screenshot shows the settled state.
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=CalculateNativeWinOcclusion",
      `--remote-debugging-port=${String(debugPort)}`,
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
          `http://127.0.0.1:${String(debugPort)}/json/version`,
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
        mobile: width <= 760,
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
    await client.send(
      "Page.navigate",
      { url: `${baseUrl}/index.html${query}` },
      sessionId,
    );

    const deadline = Date.now() + 30_000;
    let found = false;
    while (Date.now() < deadline) {
      const probe = await client.send(
        "Runtime.evaluate",
        {
          expression: `!!document.querySelector(${JSON.stringify(expect)})`,
          returnByValue: true,
        },
        sessionId,
      );
      if (probe.result.value === true) {
        found = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!found) {
      throw new Error(`${name}: timed out waiting for ${expect}.`);
    }
    // Let fonts, transitions, and any follow-up paint settle before capturing.
    await new Promise((resolve) => setTimeout(resolve, settle));

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
        `Expected ${String(width)}x${String(height)}, got ${String(metrics.width)}x${String(metrics.height)}.`,
      );
    }
    if (metrics.scrollWidth > width) {
      throw new Error(
        `${name} overflowed: ${String(metrics.scrollWidth)}px content in ${String(width)}px viewport.`,
      );
    }

    const screenshot = await client.send(
      "Page.captureScreenshot",
      { format: "png", fromSurface: true, captureBeyondViewport: false },
      sessionId,
    );
    await writeFile(join(OUT, name), screenshot.data, "base64");
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

const DESKTOP = { width: 1280, height: 900 };
const TABLET = { width: 834, height: 1112 };
const MOBILE = { width: 390, height: 844 };
const MOBILE_SMALL = { width: 360, height: 800 };

const REGISTER = "/projects/p1/records";
const route = (search = "") => encodeURIComponent(`${REGISTER}${search}`);

const ROW = "[data-record-row]";
const CARD = "[data-record-card]";

// --- Desktop -------------------------------------------------------------
await capture("document-register-desktop-populated.png", {
  ...DESKTOP,
  query: `?route=${route()}`,
  expect: ROW,
});
await capture("document-register-desktop-multi-filter.png", {
  ...DESKTOP,
  query: `?route=${route("?q=plan&type=drawing&discipline=structural")}`,
  expect: ".base-filter-chip",
});
await capture("document-register-desktop-archived-included.png", {
  ...DESKTOP,
  query: `?route=${route("?archived=all")}`,
  expect: `${ROW} .base-badge`,
});
await capture("document-register-desktop-add-choice.png", {
  ...DESKTOP,
  query: `?route=${route()}&recordScenario=add-choice`,
  expect: ".add-document-drawer [data-mode='upload']",
});
await capture("document-register-desktop-add-upload.png", {
  ...DESKTOP,
  query: `?route=${route()}&recordScenario=add-upload`,
  expect: ".add-document-form [data-document-file]",
});
await capture("document-register-desktop-partial-success-recovery.png", {
  ...DESKTOP,
  query: `?route=${route()}&recordScenario=add-recovery&recordCreateMode=revision-failure`,
  expect: "[data-recovery-link]",
});

// --- States --------------------------------------------------------------
await capture("document-register-first-use-empty.png", {
  ...DESKTOP,
  query: `?route=${route()}&recordFixture=empty`,
  expect: "[data-status='empty-first-use']",
});
await capture("document-register-no-active-but-archived.png", {
  ...DESKTOP,
  query: `?route=${route()}&recordFixture=archived-only`,
  expect: "[data-include-archived]",
});
await capture("document-register-filtered-empty.png", {
  ...DESKTOP,
  query: `?route=${route("?q=nothing-matches-this")}`,
  expect: "[data-status='empty-filtered'] [data-clear-filters]",
});
await capture("document-register-error.png", {
  ...DESKTOP,
  query: `?route=${route()}&recordFixture=error`,
  expect: ".base-state--error",
});

// --- Tablet --------------------------------------------------------------
await capture("document-register-tablet-populated.png", {
  ...TABLET,
  query: `?route=${route()}`,
  expect: ROW,
});

// --- Mobile --------------------------------------------------------------
await capture("document-register-mobile-cards.png", {
  ...MOBILE,
  query: `?route=${route()}`,
  expect: CARD,
});
await capture("document-register-mobile-search-filters-collapsed.png", {
  ...MOBILE,
  query: `?route=${route("?q=framing")}`,
  expect: CARD,
});
await capture("document-register-mobile-filter-expanded-active.png", {
  ...MOBILE,
  query: `?route=${route("?type=drawing&discipline=structural")}&recordScenario=mobile-filters`,
  expect: ".base-toolbar__filters--mobile-disclosure.is-open",
});
await capture("document-register-mobile-add-document-fullscreen.png", {
  ...MOBILE,
  query: `?route=${route()}&recordScenario=add-upload`,
  expect: ".add-document-form [data-document-file]",
});
await capture("document-register-mobile-small-cards.png", {
  ...MOBILE_SMALL,
  query: `?route=${route()}`,
  expect: CARD,
});

await new Promise((resolve) => server.close(resolve));
console.log("UI-6B evidence capture complete.");
