// Dev-only deterministic RFI Slice 2B evidence capture. Everything is served
// from the shared application-shell evidence artifact and driven through the
// REAL React RFI workspace, its real API layer, and the real mark-ready and
// official-issue workflows in src/ui/app/evidence/harness.tsx -- production
// components only, no static mock markup. Every capture asserts the CSS
// viewport it claims and fails if the page overflows horizontally.
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { extname, join, normalize } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../dist/ui-4-evidence", import.meta.url));
const OUT = fileURLToPath(new URL("../docs/evidence/rfi-2b", import.meta.url));
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!CHROME) {
  throw new Error(
    `No Chrome/Chromium binary found. Set CHROME_PATH, or install Chrome. Checked: ${CHROME_CANDIDATES.join(", ")}`,
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
 * workspace has reached the state being documented, rather than sleeping for a
 * fixed budget. A state that never arrives fails the run loudly rather than
 * being captured silently half-rendered.
 */
async function capture(name, { width, height, query, expect, settle = 400 }) {
  const debugPort = await availablePort();
  const profile = await mkdtemp(join(tmpdir(), "base-rfi2b-cdp-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
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
const MOBILE_LARGE = { width: 430, height: 932 };

const RFI = "/projects/p1/rfis/rfi-1";
const route = encodeURIComponent(RFI);
const at = (params) => `?route=${route}&${params}`;

const DIALOG = '[role="dialog"]';
const ALERT_DIALOG = '[role="alertdialog"]';

// --- Draft and mark ready -------------------------------------------------
await capture("rfi2b-draft-clean-mark-ready.png", {
  ...DESKTOP,
  query: at("rfiWorkspaceFixture=draft"),
  expect: "[data-mark-ready]",
});
await capture("rfi2b-draft-dirty-save-and-mark-ready.png", {
  ...DESKTOP,
  query: at("rfiWorkspaceFixture=draft&rfiWorkspaceScenario=dirty-draft"),
  expect: '[data-rfi-content-form][data-rfi-dirty="true"]',
});
await capture("rfi2b-mark-ready-confirm.png", {
  ...DESKTOP,
  query: at(
    "rfiWorkspaceFixture=draft&rfiWorkspaceScenario=mark-ready-confirm",
  ),
  expect: ALERT_DIALOG,
});
await capture("rfi2b-mark-ready-dirty-confirm.png", {
  ...DESKTOP,
  query: at(
    "rfiWorkspaceFixture=draft&rfiWorkspaceScenario=mark-ready-dirty-confirm",
  ),
  expect: ALERT_DIALOG,
});
await capture("rfi2b-mark-ready-validation-failure.png", {
  ...DESKTOP,
  query: at(
    "rfiWorkspaceFixture=draft&rfiWorkspaceScenario=mark-ready-failure&rfiReadyMode=validation-failure",
  ),
  expect: ".rfi-workspace-error",
});

// --- Ready to issue -------------------------------------------------------
await capture("rfi2b-ready-to-issue-workspace.png", {
  ...DESKTOP,
  query: at("rfiWorkspaceFixture=ready"),
  expect: "[data-issue-rfi]",
});
await capture("rfi2b-ready-return-to-draft-overflow.png", {
  ...DESKTOP,
  query: at("rfiWorkspaceFixture=ready&rfiWorkspaceScenario=ready-overflow"),
  expect: ".base-menu",
});

// --- Issue workflow -------------------------------------------------------
await capture("rfi2b-issue-details.png", {
  ...DESKTOP,
  query: at("rfiWorkspaceFixture=ready&rfiWorkspaceScenario=issue-details"),
  expect: "[data-issue-recipients]",
});
await capture("rfi2b-issue-recipients-and-cc.png", {
  ...DESKTOP,
  query: at("rfiWorkspaceFixture=ready&rfiWorkspaceScenario=issue-recipients"),
  expect: '[data-issue-cc] [role="checkbox"][data-state="checked"]',
});
await capture("rfi2b-issue-included-files.png", {
  ...DESKTOP,
  query: at("rfiWorkspaceFixture=ready&rfiWorkspaceScenario=issue-files"),
  expect: '[data-issue-files] [role="checkbox"][data-state="unchecked"]',
});
await capture("rfi2b-issue-review.png", {
  ...DESKTOP,
  query: at("rfiWorkspaceFixture=ready&rfiWorkspaceScenario=issue-review"),
  expect: "[data-issue-review]",
});
await capture("rfi2b-issue-pending.png", {
  ...DESKTOP,
  query: at(
    "rfiWorkspaceFixture=ready&rfiWorkspaceScenario=issue-pending&rfiIssueMode=pending",
  ),
  expect: "[data-issue-pending]",
});
await capture("rfi2b-issue-retryable-failure.png", {
  ...DESKTOP,
  query: at(
    "rfiWorkspaceFixture=ready&rfiWorkspaceScenario=issue-failure&rfiIssueMode=retryable",
  ),
  expect: ".rfi-issue-failure",
});
await capture("rfi2b-issue-reconciliation-required.png", {
  ...DESKTOP,
  query: at(
    "rfiWorkspaceFixture=ready&rfiWorkspaceScenario=issue-failure&rfiIssueMode=reconcile",
  ),
  expect: ".rfi-issue-failure",
});

// --- Issued evidence ------------------------------------------------------
await capture("rfi2b-issued-workspace-official-pdf.png", {
  ...DESKTOP,
  query: at("rfiWorkspaceFixture=issued"),
  expect: "[data-official-pdf-download]",
});
await capture("rfi2b-issued-recipients-and-files.png", {
  ...DESKTOP,
  query: at("rfiWorkspaceFixture=issued&rfiWorkspaceScenario=issued-evidence"),
  expect: "[data-issued-files]",
});
await capture("rfi2b-issued-after-live-issue.png", {
  ...DESKTOP,
  query: at("rfiWorkspaceFixture=ready&rfiWorkspaceScenario=issue-commit"),
  expect: "[data-official-pdf-download]",
});
await capture("rfi2b-issued-tablet.png", {
  ...TABLET,
  query: at("rfiWorkspaceFixture=issued"),
  expect: "[data-official-pdf-download]",
});

// --- Mobile and long content ---------------------------------------------
await capture("rfi2b-issue-details-mobile-390.png", {
  ...MOBILE,
  query: at("rfiWorkspaceFixture=ready&rfiWorkspaceScenario=issue-details"),
  expect: "[data-issue-recipients]",
});
await capture("rfi2b-issue-review-mobile-390.png", {
  ...MOBILE,
  query: at("rfiWorkspaceFixture=ready&rfiWorkspaceScenario=issue-review"),
  expect: "[data-issue-review]",
});
await capture("rfi2b-issue-review-mobile-430.png", {
  ...MOBILE_LARGE,
  query: at("rfiWorkspaceFixture=ready&rfiWorkspaceScenario=issue-review"),
  expect: "[data-issue-review]",
});
await capture("rfi2b-issued-mobile-390.png", {
  ...MOBILE,
  query: at("rfiWorkspaceFixture=issued&rfiWorkspaceScenario=issued-evidence"),
  expect: "[data-issued-files]",
});
await capture("rfi2b-long-content-issue-details.png", {
  ...DESKTOP,
  query: at(
    "rfiWorkspaceFixture=ready-long&rfiWorkspaceScenario=issue-details",
  ),
  expect: "[data-issue-files]",
});
await capture("rfi2b-long-content-issue-details-mobile-390.png", {
  ...MOBILE,
  query: at(
    "rfiWorkspaceFixture=ready-long&rfiWorkspaceScenario=issue-details",
  ),
  expect: "[data-issue-files]",
});
await capture("rfi2b-long-content-issued-evidence.png", {
  ...DESKTOP,
  query: at("rfiWorkspaceFixture=ready-long&rfiWorkspaceScenario=issue-commit"),
  expect: "[data-issued-files]",
  settle: 700,
});
await capture("rfi2b-long-content-issued-evidence-mobile-390.png", {
  ...MOBILE,
  query: at("rfiWorkspaceFixture=ready-long&rfiWorkspaceScenario=issue-commit"),
  expect: "[data-issued-files]",
  settle: 700,
});

await new Promise((resolve) => server.close(resolve));
console.log("RFI Slice 2B evidence capture complete.");
console.log(
  `Every capture asserted its CSS viewport and failed on horizontal overflow; ${DIALOG} states came from the real workflow.`,
);
