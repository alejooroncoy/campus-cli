// La nota de invitado del sidebar solo se muestra cuando la sesión confirma que no hay cuenta.
// En una pestaña nueva (sin perfil guardado) con cuenta iniciada no debe pintarse ni un instante.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const root = resolve("dist");
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let path = resolve(root, "." + url.pathname);
    if (!path.startsWith(root + "/")) throw Error();
    if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
    res.writeHead(200, {
      "content-type": { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" }[extname(path)] ?? "application/octet-stream",
    });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ headless: true });

const account = {
  authenticated: true,
  email: "fixture@example.test",
  plan: "plus",
  aiReady: true,
  universityConfirmed: true,
  university: { id: 1, name: "UPC", shortName: "UPC" },
  features: { schedulePlanning: false },
  banner: { connected: false },
};

async function run(session) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.__guestNoteSeen = false;
    const check = () => {
      const note = document.querySelector("[data-app-sidebar-guest-note]");
      if (note && !note.hidden && note.getClientRects().length) window.__guestNoteSeen = true;
    };
    new MutationObserver(check).observe(document, { childList: true, subtree: true, attributes: true });
    const tick = () => { check(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/app/session/") {
      await new Promise((r) => setTimeout(r, 1200));
      return route.fulfill({ json: session });
    }
    return route.fulfill({ status: 404, json: { error: "NOT_FOUND" } });
  });
  const page = await context.newPage();
  await page.goto(base + "/app/perfil/");
  await page.waitForFunction(() => document.readyState === "complete");
  await page.waitForTimeout(2000);
  const result = await page.evaluate(() => {
    const note = document.querySelector("[data-app-sidebar-guest-note]");
    const footer = document.querySelector("[data-app-sidebar-footer]");
    return {
      seen: window.__guestNoteSeen,
      visibleNow: !!note && !note.hidden,
      guestFooter: !!footer?.classList.contains("sidebar-footer--guest"),
    };
  });
  await context.close();
  return result;
}

try {
  const signedIn = await run(account);
  assert.equal(signedIn.seen, false, "con cuenta iniciada la nota de invitado no debe pintarse");
  assert.equal(signedIn.visibleNow, false);
  assert.equal(signedIn.guestFooter, false);

  const guest = await run({ authenticated: false });
  assert.equal(guest.visibleNow, true, "un invitado debe ver la nota cuando responde la sesión");
  assert.equal(guest.guestFooter, true);
  console.log("sidebar guest note: ok");
} finally {
  await browser.close();
  server.close();
}
