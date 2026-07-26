// Dev-only deterministic UI-7 evidence capture. Builds are served from the
// shared application-shell evidence artifact and the three real detail-workspace
// routes are driven through fixtures in src/ui/app/evidence/harness.tsx --
// production components only, no static mock markup. Every capture asserts the
// CSS viewport it claims and fails if the page overflows horizontally.
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { extname, join, normalize } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../dist/ui-4-evidence", import.meta.url));
const OUT = fileURLToPath(new URL("../docs/evidence/ui-7", import.meta.url));
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
 * fixed budget. A slow machine then produces the same screenshot as a fast one
 * instead of a loading skeleton, and a state that never arrives fails the run
 * loudly rather than being captured silently half-rendered.
 */
async function capture(name, { width, height, query, expect, settle = 400 }) {
  const debugPort = await availablePort();
  const profile = await mkdtemp(join(tmpdir(), "base-ui7-cdp-"));
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

const RECORD = "/projects/p1/records/record-1";
const REVISION = "/projects/p1/records/record-1/revisions/revision-3";
const RFI = "/projects/p1/rfis/rfi-1";
const route = (path) => encodeURIComponent(path);

const IDENTITY = ".base-workspace__identity";
const NOTICE = ".base-workspace-notice";

// --- Record workspace ----------------------------------------------------
await capture("record-workspace-desktop-current-version.png", {
  ...DESKTOP,
  query: `?route=${route(RECORD)}`,
  expect: `.record-workspace ${IDENTITY}`,
});
await capture("record-workspace-desktop-draft-and-current.png", {
  ...DESKTOP,
  query: `?route=${route(RECORD)}&workspaceFixture=draft`,
  expect: '.record-workspace [data-work="draft"]',
});
await capture("record-workspace-desktop-no-original.png", {
  ...DESKTOP,
  query: `?route=${route(RECORD)}&workspaceFixture=no-revision`,
  expect: '.record-workspace [data-work="none"]',
});
await capture("record-workspace-desktop-archived-readonly.png", {
  ...DESKTOP,
  query: `?route=${route(RECORD)}&workspaceFixture=archived`,
  expect: `.record-workspace ${NOTICE}`,
});
await capture("record-workspace-desktop-edit-details.png", {
  ...DESKTOP,
  query: `?route=${route(RECORD)}&workspaceScenario=edit-dialog`,
  expect: "[data-record-title]",
});
await capture("record-workspace-desktop-create-revision.png", {
  ...DESKTOP,
  query: `?route=${route(RECORD)}&workspaceScenario=create-revision`,
  expect: "[data-revision-summary]",
});
await capture("record-workspace-desktop-archive-confirm.png", {
  ...DESKTOP,
  query: `?route=${route(RECORD)}&workspaceScenario=archive-confirm`,
  expect: '[role="alertdialog"]',
});
await capture("record-workspace-error.png", {
  ...DESKTOP,
  query: `?route=${route(RECORD)}&workspaceFixture=error`,
  expect: ".base-state--error",
});
await capture("record-workspace-tablet.png", {
  ...TABLET,
  query: `?route=${route(RECORD)}&workspaceFixture=draft`,
  expect: '.record-workspace [data-work="draft"]',
});
await capture("record-workspace-mobile.png", {
  ...MOBILE,
  query: `?route=${route(RECORD)}&workspaceFixture=draft`,
  expect: '.record-workspace [data-work="draft"]',
});

// --- Revision workspace --------------------------------------------------
await capture("revision-workspace-desktop-draft-upload.png", {
  ...DESKTOP,
  query: `?route=${route(REVISION)}&workspaceFixture=draft`,
  expect: "[data-upload-form]",
});
await capture("revision-workspace-desktop-publish-confirm.png", {
  ...DESKTOP,
  query: `?route=${route(REVISION)}&workspaceFixture=draft&workspaceScenario=publish-confirm`,
  expect: '[role="alertdialog"]',
});
await capture("revision-workspace-desktop-upload-failure-recovery.png", {
  ...DESKTOP,
  query: `?route=${route(REVISION)}&workspaceFixture=draft&workspaceScenario=upload-failure&workspaceUploadMode=failure`,
  expect: ".revision-upload__error",
});
await capture("revision-workspace-desktop-published-readonly.png", {
  ...DESKTOP,
  query: `?route=${route(REVISION)}&workspaceFixture=published`,
  expect: `.revision-workspace ${NOTICE}`,
});
await capture("revision-workspace-desktop-empty-draft.png", {
  ...DESKTOP,
  query: `?route=${route(REVISION)}&workspaceFixture=empty-draft`,
  expect: ".revision-workspace .base-empty",
});
await capture("revision-workspace-mobile-draft.png", {
  ...MOBILE,
  query: `?route=${route(REVISION)}&workspaceFixture=draft`,
  expect: "[data-upload-form]",
});

// --- RFI workspace -------------------------------------------------------
await capture("rfi-workspace-desktop-draft-editor.png", {
  ...DESKTOP,
  query: `?route=${route(RFI)}&rfiWorkspaceFixture=draft`,
  expect: "[data-rfi-content-form]",
});
await capture("rfi-workspace-desktop-issued-readonly.png", {
  ...DESKTOP,
  query: `?route=${route(RFI)}&rfiWorkspaceFixture=issued`,
  expect: ".rfi-workspace-facts",
});
await capture("rfi-workspace-desktop-response-recorded.png", {
  ...DESKTOP,
  query: `?route=${route(RFI)}&rfiWorkspaceFixture=responded`,
  expect: "[data-recorded-response]",
});
await capture("rfi-workspace-desktop-legacy-reconciliation.png", {
  ...DESKTOP,
  query: `?route=${route(RFI)}&rfiWorkspaceFixture=legacy`,
  expect: `.rfi-workspace ${NOTICE}`,
});
await capture("rfi-workspace-desktop-void-confirm.png", {
  ...DESKTOP,
  query: `?route=${route(RFI)}&rfiWorkspaceScenario=void-confirm`,
  expect: '[role="alertdialog"]',
});
await capture("rfi-workspace-desktop-validation-error.png", {
  ...DESKTOP,
  query: `?route=${route(RFI)}&rfiWorkspaceScenario=validation-error`,
  expect: ".base-field__error, [role='alert']",
});
await capture("rfi-workspace-desktop-document-view-unavailable.png", {
  ...DESKTOP,
  query: `?route=${route(RFI)}&rfiWorkspaceScenario=preview`,
  // No "Show document view" toggle is rendered in this state -- only the
  // restrained, non-interactive note.
  expect: "[data-preview-unavailable]",
});
await capture("rfi-workspace-desktop-long-content.png", {
  ...DESKTOP,
  query: `?route=${route(RFI)}&rfiWorkspaceFixture=long`,
  expect: "[data-rfi-content-form]",
});
await capture("rfi-workspace-mobile-long-content.png", {
  ...MOBILE,
  query: `?route=${route(RFI)}&rfiWorkspaceFixture=long`,
  expect: "[data-rfi-content-form]",
});
await capture("rfi-workspace-error.png", {
  ...DESKTOP,
  query: `?route=${route(RFI)}&rfiWorkspaceFixture=error`,
  expect: ".base-state--error",
});
await capture("rfi-workspace-tablet-draft.png", {
  ...TABLET,
  query: `?route=${route(RFI)}&rfiWorkspaceFixture=draft`,
  expect: "[data-rfi-content-form]",
});
await capture("rfi-workspace-mobile-draft.png", {
  ...MOBILE,
  query: `?route=${route(RFI)}&rfiWorkspaceFixture=draft`,
  expect: "[data-rfi-content-form]",
});
await capture("rfi-workspace-mobile-large-responded.png", {
  ...MOBILE_LARGE,
  query: `?route=${route(RFI)}&rfiWorkspaceFixture=responded`,
  expect: "[data-recorded-response]",
});

await new Promise((resolve) => server.close(resolve));
console.log("UI-7 evidence capture complete.");
