// Dev-only: capture UI-4 shell desktop/mobile evidence from the built harness
// (dist/ui-4-evidence) using the pre-installed Chromium. Not part of CI.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = fileURLToPath(new URL("../dist/ui-4-evidence", import.meta.url));
const OUT = fileURLToPath(new URL("../docs/evidence/ui-4", import.meta.url));
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

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

const browser = await chromium.launch({ executablePath: CHROME });

async function shot(name, { width, height, query }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(`${base}/index.html${query}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#page-title, .project-context-header h1", {
    timeout: 5000,
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, name), fullPage: true });
  await context.close();
  console.log(`captured ${name}`);
}

await shot("shell-desktop.png", {
  width: 1280,
  height: 900,
  query: "?route=/projects/p1/records",
});
await shot("shell-mobile.png", {
  width: 390,
  height: 844,
  query: "?route=/projects/p1/records",
});
await shot("shell-mobile-drawer.png", {
  width: 390,
  height: 844,
  query: "?route=/projects/p1/records&drawer=1",
});
await shot("shell-dashboard-desktop.png", {
  width: 1280,
  height: 900,
  query: "?route=/dashboard",
});

await browser.close();
server.close();
console.log("done");
