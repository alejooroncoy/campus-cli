import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const candidateServerScripts = [
  process.env.CAMPUS_PROFES_SERVER,
  resolve(__dirname, "../../../campus-profes/scripts/review-e2e-server.ts"),
  resolve("/Users/USER/alejo/campus-profes/scripts/review-e2e-server.ts"),
].filter(Boolean);
const serverScript = candidateServerScripts.find(p => existsSync(p));
if (!serverScript) {
  throw new Error("Could not locate review-e2e-server.ts. Checked: " + candidateServerScripts.join(", "));
}
const siteDist = resolve(__dirname, "../dist");
const port = 4328;
const origin = `http://127.0.0.1:${port}`;

console.log("Starting review E2E test suite...");

// 1. Start review-e2e-server
const serverProcess = spawn("node", [serverScript], {
  env: { ...process.env, CAMPUS_E2E_PORT: String(port), CAMPUS_SITE_DIST: siteDist },
  stdio: ["ignore", "pipe", "pipe"],
});

serverProcess.stderr.on("data", data => {
  const msg = data.toString();
  if (msg.trim()) console.error("[Server Error]", msg.trim());
});

// Wait for server to be ready
let ready = false;
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch(`${origin}/__e2e/state`);
    if (res.ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise(r => setTimeout(r, 200));
}

if (!ready) {
  serverProcess.kill();
  throw new Error("E2E fixture server failed to start within 6 seconds.");
}

console.log("Fixture server is ready on " + origin);

let browser;
let exitCode = 0;

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("\n[Test 1] Redirect /app/profes/ -> /app/asistente/");
  await page.goto(`${origin}/app/profes/`);
  await page.waitForURL(`**/app/asistente/**`);
  assert.equal(new URL(page.url()).pathname, "/app/asistente/");
  const breadcrumb = await page.locator(".app-breadcrumb").textContent();
  assert.ok(breadcrumb.includes("Asistente"), `Breadcrumb should contain Asistente, got "${breadcrumb}"`);
  const activeNav = await page.locator(".sidebar-menu-btn.is-active").textContent();
  assert.ok(activeNav.includes("Asistente"), `Active nav button should be Asistente, got "${activeNav}"`);
  console.log("✓ Redirect /app/profes/ to /app/asistente/ passed");

  console.log("\n[Test 2] Redirect /app/profes/?modal=review -> /app/asistente/?modal=review with modal open");
  await page.goto(`${origin}/app/profes/?modal=review`);
  await page.waitForURL(`**/app/asistente/?modal=review`);
  assert.equal(new URL(page.url()).pathname, "/app/asistente/");
  assert.equal(new URL(page.url()).searchParams.get("modal"), "review");

  const dialog = page.locator(".app-profes-review");
  await dialog.waitFor({ state: "visible" });
  const isModal = await dialog.evaluate(el => el.matches(":modal"));
  assert.ok(isModal, "Review dialog should be open as modal");

  const title = await page.locator("#review-title").textContent();
  assert.equal(title, "¿A quién quieres reseñar?");
  const eyebrow = await page.locator(".app-profes-review__eyebrow").textContent();
  assert.ok(eyebrow.includes("1 de 2 · Curso y docente"), `Expected eyebrow 1 de 2, got "${eyebrow}"`);
  const note = await page.locator(".app-profes-review__draft-note").textContent();
  assert.equal(note, "Elige un docente para continuar");
  console.log("✓ Modal open on load with ?modal=review passed");

  console.log("\n[Test 3] Closing modal removes modal=review from URL");
  const closeBtn = page.locator(".app-profes-review__close");
  await closeBtn.click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(new URL(page.url()).pathname, "/app/asistente/");
  assert.equal(new URL(page.url()).searchParams.get("modal"), null, "modal query param should be removed");
  console.log("✓ Closing modal cleans query param passed");

  console.log("\n[Test 4] Opening modal via 'Dejar una reseña' updates URL to ?modal=review");
  const leaveReviewBtn = page.getByRole("button", { name: "Dejar una reseña" });
  await leaveReviewBtn.click();
  await dialog.waitFor({ state: "visible" });
  assert.equal(new URL(page.url()).searchParams.get("modal"), "review");
  console.log("✓ Opening modal sets ?modal=review passed");

  console.log("\n[Test 5] Back and Forward buttons toggle modal state");
  await page.goBack();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(new URL(page.url()).searchParams.get("modal"), null);

  await page.goForward();
  await dialog.waitFor({ state: "visible" });
  assert.equal(new URL(page.url()).searchParams.get("modal"), "review");
  console.log("✓ Browser back/forward navigation toggles modal correctly");

  console.log("\n[Test 6] Full review creation and submission flow");
  const searchInput = page.getByPlaceholder("Nombre o código del curso");
  await searchInput.fill("MA100");
  const courseOption = page.getByRole("button", { name: "Matemática Básica (E2E) MA100" });
  await courseOption.waitFor({ state: "visible" });
  await courseOption.click();

  const profOption = page.getByRole("button", { name: "Ana Pérez (E2E) UPC" });
  await profOption.waitFor({ state: "visible" });
  await profOption.click();

  const experienceTextarea = page.getByLabel("Tu experiencia");
  await experienceTextarea.waitFor({ state: "visible" });
  await experienceTextarea.fill("Excelente profesora, explica muy claro y resuelve dudas paso a paso.");

  await page.getByLabel("Calificación (opcional)").fill("9");
  await page.getByLabel("Ciclo (opcional)").fill("2026-2");

  const reviewBtn = page.getByRole("button", { name: "Revisar reseña" });
  await reviewBtn.click();

  const preview = page.locator(".app-profes-review__preview");
  await preview.waitFor({ state: "visible" });
  const previewText = await preview.textContent();
  assert.ok(previewText.includes("Ana Pérez (E2E)"));
  assert.ok(previewText.includes("9 / 10"));
  assert.ok(previewText.includes("2026-2"));

  const submitBtn = page.getByRole("button", { name: "Confirmar y enviar" });
  await submitBtn.click();

  const doneBtn = page.getByRole("button", { name: "Volver al chat" });
  await doneBtn.waitFor({ state: "visible" });
  const doneTitle = await page.locator("#review-title").textContent();
  assert.equal(doneTitle, "Reseña recibida");

  await doneBtn.click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(new URL(page.url()).searchParams.get("modal"), null);
  console.log("✓ Review creation and submission passed");

  console.log("\n[Test 7] Mobile viewport 390x640 bottom sheet layout");
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto(`${origin}/app/asistente/?modal=review`);
  await dialog.waitFor({ state: "visible" });
  const geometry = await page.evaluate(() => {
    const panel = document.querySelector(".app-profes-review__panel")?.getBoundingClientRect();
    return {
      panel,
      windowHeight: window.innerHeight,
      windowWidth: window.innerWidth,
    };
  });
  console.log("Mobile geometry:", geometry);
  assert.ok(geometry.panel.width <= geometry.windowWidth + 1, "Modal panel fits width");
  assert.equal(geometry.panel.width, geometry.windowWidth, "Modal panel width matches viewport on mobile");
  console.log("✓ Mobile viewport checks passed");

  console.log("\n[Test 8] Conversation deep link handling");
  await page.goto(`${origin}/app/asistente/c/118adac7-9134-4f9e-b751-a145605de41c/`);
  assert.equal(new URL(page.url()).pathname, "/app/asistente/c/118adac7-9134-4f9e-b751-a145605de41c/");
  console.log("✓ Conversation deep link passed");

  console.log("\n==========================================");
  console.log("ALL 8 E2E TEST SCENARIOS PASSED WITH SUCCESS!");
  console.log("==========================================\n");

} catch (err) {
  console.error("\n❌ E2E Test Failure:", err);
  exitCode = 1;
} finally {
  if (browser) await browser.close();
  serverProcess.kill();
  process.exit(exitCode);
}
