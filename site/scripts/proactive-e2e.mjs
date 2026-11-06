import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const root = resolve("dist"),
  noticeId = "11111111-1111-4111-8111-111111111111",
  contextId = "22222222-2222-4222-8222-222222222222";
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let path = resolve(
      root,
      "." +
        (/^\/app\/novedades\/[0-9a-f-]{36}\/$/.test(url.pathname)
          ? "/app/novedades/"
          : url.pathname),
    );
    if (!path.startsWith(root + "/")) throw Error();
    if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
    res.writeHead(200, {
      "content-type":
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".json": "application/json",
        }[extname(path)] ?? "application/octet-stream",
    });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port,
  browser = await chromium.launch({ headless: true });
const session = {
  authenticated: true,
  analyticsId: "campus:synthetic-owner",
  email: "fixture@example.test",
  plan: "plus",
  aiReady: true,
  universityConfirmed: true,
  profesAvailable: true,
  university: { id: 1, name: "UPC", shortName: "UPC" },
  features: { schedulePlanning: false },
  banner: { connected: false },
};
const prepared = {
  id: contextId,
  summary: "Una entrega publicada para esta semana.",
  preparedAt: "2026-11-09T13:00:00Z",
  lastSuccessfulCheckAt: "2026-11-09T13:00:00Z",
  freshness: "stale",
  preparation: "partial",
  coverage: {
    complete: false,
    documentsComplete: false,
    sources: [
      {
        source: "blackboard:assignments",
        complete: true,
        checkedAt: "2026-11-09T13:00:00Z",
      },
      {
        source: "miupc:grades",
        complete: false,
        checkedAt: "2026-11-09T13:00:00Z",
        errors: ["reconnect_required"],
      },
    ],
  },
  facts: [
    {
      id: "fact1",
      kind: "assignment",
      course: "Curso de prueba",
      title: 'Trabajo privado <img src=x onerror="window.injected=true">',
      dueAt: "2026-11-12T23:59:00Z",
      source: "blackboard_list_assignments",
    },
    {
      id: "fact2",
      kind: "grade",
      course: "Curso de prueba",
      title: "Práctica",
      score: 0,
      maxScore: 20,
    },
  ],
  claims: [
    {
      text: "La evaluación está programada para la semana 10.",
      status: "scheduled",
      evidenceIds: ["e1"],
    },
  ],
  evidence: [
    {
      id: "e1",
      course: "Curso de prueba",
      title: "Sílabo oficial",
      locator: "Página 2",
      text: "Semana 10: evaluación.",
    },
  ],
  // Semana 5 del ciclo: TB1 ya entregado; TP1 es lo siguiente y no es tarea en Blackboard.
  upcoming: {
    term: "202602",
    week: 5,
    from: "2026-09-21",
    to: "2026-09-27",
    counts: { thisWeek: 1, nextWeek: 1, notInBlackboard: 1 },
    items: [
      {
        courseId: "c1",
        course: "Curso de prueba",
        title: 'TB2 <img src=x onerror="window.injected=true">',
        what: "entrega",
        studentAction: true,
        when: { kind: "week", text: "Semana 5" },
        from: "2026-09-21",
        to: "2026-09-27",
        bucket: "this_week",
        inBlackboard: true,
        done: false,
        next: false,
        after: null,
      },
      {
        courseId: "c1",
        course: "Curso de prueba",
        title: "TP1",
        what: "evaluación",
        studentAction: true,
        when: { kind: "week", text: "Semana 6" },
        from: "2026-09-28",
        to: "2026-10-04",
        bucket: "next_week",
        inBlackboard: false,
        done: false,
        next: true,
        after: "TB1",
      },
      {
        courseId: "c1",
        course: "Curso de prueba",
        title: "TB1",
        what: "entrega",
        studentAction: true,
        when: { kind: "week", text: "Semana 4" },
        from: "2026-09-14",
        to: "2026-09-20",
        bucket: "this_week",
        inBlackboard: true,
        done: true,
        next: false,
        after: null,
      },
      {
        courseId: "c1",
        course: "Curso de prueba",
        title: "Examen final",
        what: "evaluación",
        studentAction: true,
        when: { kind: "relative", text: "dos semanas después de la PC2" },
        from: null,
        to: null,
        bucket: "unscheduled",
        inBlackboard: false,
        done: false,
        next: false,
        after: null,
      },
    ],
  },
  pending: ["La plantilla no especifica el alcance del avance."],
  prompt: `Usa campus_get_prepared_context con contextId "${contextId}".`,
  nextCursor: null,
  nextEvidenceCursor: null,
};
const events = [
  {
    id: "ev1",
    kind: "grade_changed",
    meaning: "grade_published",
    detectedAt: "2026-11-09T13:00:00Z",
    fact: {
      id: "miupc-grade:202620:1ASI0728:PC1",
      kind: "grade",
      course: "Curso oficial",
      title: "Práctica Calificada 1",
      score: 17,
      weight: 15,
      term: "202620",
      status: "published",
      source: "miupc:grades",
    },
    changes: [{ path: "/score", after: 17 }],
  },
  {
    id: "ev2",
    kind: "material_removed",
    meaning: "removed",
    detectedAt: "2026-11-09T13:00:00Z",
    fact: {
      id: "material:x",
      kind: "material",
      course: "Curso de prueba",
      title: "Guía retirada",
      source: "blackboard_list_contents",
    },
  },
];
try {
  for (const width of [390, 1100]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 844 },
      serviceWorkers: "block",
    });
    await ctx.addInitScript(() => {
      window.copies = [];
      window.permissionRequests = 0;
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: async (text) => window.copies.push(text) },
      });
      Object.defineProperty(window, "Notification", {
        value: {
          requestPermission: async () => {
            window.permissionRequests++;
            return "denied";
          },
        },
      });
    });
    const page = await ctx.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let preferences = {
        enabled: true,
        email: true,
        push: false,
        procedures: false,
        courses: [],
        timezone: "America/Lima",
        categories: ["assignments", "grades", "materials", "announcements"],
      },
      saved = 0,
      deleted = 0,
      nickname = null,
      nicknameCalls = 0,
      statusCalls = 0,
      failNotices = false,
      noticesFailed = 0,
      failWeek = false,
      weekFailed = 0,
      weekDelay = 0,
      weekStarted = 0;
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (!url.pathname.startsWith("/api/app/")) return route.continue();
      const path = url.pathname.replace(/\/$/, ""),
        method = route.request().method(),
        json = (data) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(data),
          });
      if (path === "/api/app/session") return json(session);
      if (path === "/api/app/proactive/status") {
        statusCalls++;
        return json({
          available: true,
          status: "active",
          preferences,
          nickname,
          suggestedNickname: "Alejo",
          lastSuccessAt: "2026-11-09T13:00:00Z",
          coverage: { complete: false },
          pushPublicKey: "fake-public-key",
        });
      }
      if (path === "/api/app/proactive/week") {
        weekStarted++;
        if (weekDelay) await new Promise((r) => setTimeout(r, weekDelay));
      }
      if (path === "/api/app/proactive/week" && failWeek) {
        weekFailed++;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "PREPARING" }),
        });
      }
      if (path === "/api/app/proactive/notices" && failNotices) {
        noticesFailed++;
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "TEMPORAL" }),
        });
      }
      if (path === "/api/app/proactive/notices")
        return json({
          notices: [
            {
              id: noticeId,
              title: "Ya preparé tu semana",
              createdAt: "2026-11-09T13:00:00Z",
              read: false,
              contextId,
            },
          ],
          nextCursor: null,
        });
      if (path === "/api/app/proactive/notices/" + noticeId)
        return json(
          method === "POST"
            ? { ok: true }
            : { notice: { id: noticeId, contextId }, events },
        );
      if (
        path === "/api/app/proactive/week" ||
        path === "/api/app/proactive/contexts/" + contextId
      )
        return json(prepared);
      if (path === "/api/app/proactive/preferences") {
        preferences = JSON.parse(route.request().postData());
        saved++;
        return json({
          preferences,
          status: preferences.enabled ? "preparing" : "paused",
        });
      }
      if (path === "/api/app/proactive/nickname" && method === "POST") {
        nicknameCalls++;
        nickname = JSON.parse(route.request().postData()).nickname || null;
        return json({ nickname, suggestedNickname: "Alejo" });
      }
      if (path === "/api/app/proactive/data" && method === "DELETE") {
        deleted++;
        return json({ status: "disabled" });
      }
      return json({});
    });
    try {
      await page.goto(base + "/app/novedades/" + noticeId + "/");
      await page
        .getByRole("heading", { name: "Esto es lo que pude revisar." })
        .waitFor();
      assert.equal(await page.evaluate(() => window.permissionRequests), 0);
      assert.equal(await page.evaluate(() => !!window.injected), false);
      assert.ok(await page.getByText("0 / 20").count());
      // Procedencia: una nota de Mi UPC no se presenta como de Blackboard.
      assert.ok(
        await page.getByText("Nota oficial en Mi UPC · 202620", { exact: false }).count(),
      );
      assert.ok(await page.getByText("Antes no tenía nota registrada.").count());
      assert.ok(await page.getByText("Peso: 15%").count());
      // Lo que viene: pestañas con contador, una lista a la vez, sin lo ya entregado.
      const viene = page.locator(".campu-upcoming");
      await viene.getByRole("heading", { name: "Lo que viene" }).waitFor();
      assert.ok(await viene.getByText("Semana 5", { exact: true }).count());
      assert.deepEqual(
        (await viene.getByRole("tab").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")),
        ["Esta semana 1", "Próxima 1", "Sin fecha 1"],
      );
      // Abre en la primera pestaña con algo; el título con HTML queda como texto.
      assert.ok(await viene.getByText("TB2 <img", { exact: false }).count());
      assert.equal(await viene.getByText("TB1", { exact: true }).count(), 0);
      await viene.getByRole("tab", { name: /Próxima/ }).click();
      assert.ok(await viene.getByText("TP1", { exact: true }).count());
      assert.ok(await viene.getByText("28 set–4 oct", { exact: true }).count());
      assert.ok(await viene.getByText("Aún no está en Blackboard").count());
      await viene.getByRole("tab", { name: /Sin fecha/ }).click();
      assert.ok(await viene.getByText("Examen final", { exact: true }).count());
      assert.equal(await viene.getByText("TP1", { exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => !!window.injected), false);
      assert.ok(await page.getByText("Ya no aparece en la fuente", { exact: false }).count());
      assert.ok(
        await page
          .getByText("Notas oficiales de Mi UPC: necesita que renueves la conexión")
          .count(),
      );
      await page
        .getByRole("button", { name: "Copiar pedido preparado" })
        .click();
      assert.equal(
        (await page.evaluate(() => window.copies))[0],
        prepared.prompt,
      );
      await page.getByLabel("Avisos al correo de mi cuenta").uncheck();
      await page.getByRole("button", { name: "Guardar preferencias" }).click();
      await page
        .getByText("Preferencias guardadas.", { exact: false })
        .waitFor();
      assert.equal(saved, 1);
      assert.equal(preferences.email, false);
      // Apodo: sugerido de entrada, símbolos rechazados sin llamar al servidor,
      // y guardarlo no toca las preferencias.
      const apodo = page.getByLabel("Mi apodo");
      assert.equal(await apodo.getAttribute("placeholder"), "Alejo");
      await apodo.fill("<b>x</b>");
      await page.getByRole("button", { name: "Guardar apodo" }).click();
      await page.getByText("Usa solo letras", { exact: false }).waitFor();
      assert.equal(nicknameCalls, 0);
      await apodo.fill("Ale");
      // La sesión se revalida cada 15 s y avisa a la página: eso no debe
      // vaciar la pantalla, volver a pedir el estado ni borrar lo escrito.
      const antes = statusCalls;
      await page.evaluate(async () => {
        const detail = await (await fetch("/api/app/session")).json();
        for (let i = 0; i < 3; i++)
          window.dispatchEvent(new CustomEvent("campus:session-updated", { detail }));
      });
      await page.waitForTimeout(400);
      assert.equal(statusCalls, antes);
      assert.equal(await apodo.inputValue(), "Ale");
      await page.getByRole("button", { name: "Guardar apodo" }).click();
      await page.getByText("Listo, te voy a decir Ale.").waitFor();
      assert.equal(nickname, "Ale");
      assert.equal(saved, 1);
      await apodo.fill("");
      await page.getByRole("button", { name: "Guardar apodo" }).click();
      await page.getByText("Listo, vuelvo a usar tu nombre.").waitFor();
      assert.equal(nickname, null);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      assert.equal(
        await page.evaluate(
          (t) =>
            JSON.stringify({ ...localStorage, ...sessionStorage }).includes(t),
          prepared.prompt,
        ),
        false,
      );
      await mkdir(".test-results/proactive", { recursive: true });
      await page.screenshot({
        path: `.test-results/proactive/${width}.png`,
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Eliminar mis preparaciones y pausar" })
        .click();
      assert.equal(deleted, 0);
      await page.getByRole("button", { name: "Confirmar eliminación" }).click();
      await page
        .getByText(
          "Tus preparaciones se eliminaron y el seguimiento quedó desactivado.",
        )
        .waitFor();
      assert.equal(deleted, 1);
      assert.equal(
        await page.getByText("Trabajo privado", { exact: false }).count(),
        0,
      );
      await page.evaluate(
        (detail) =>
          window.dispatchEvent(
            new CustomEvent("campus:session-updated", { detail }),
          ),
        {
          ...session,
          authenticated: false,
          analyticsId: undefined,
          email: undefined,
        },
      );
      await page
        .getByRole("heading", { name: "Tus novedades son privadas." })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Guardar preferencias" })
          .count(),
        0,
      );
      // Si /status carga pero los avisos fallan, el siguiente evento de sesión
      // vuelve a intentarlo en vez de dejar la pantalla sin contenido.
      failNotices = true;
      await page.reload();
      for (let i = 0; i < 50 && !noticesFailed; i++)
        await page.waitForTimeout(100);
      assert.ok(noticesFailed >= 1);
      failNotices = false;
      const antesReintento = statusCalls;
      await page.evaluate(
        (detail) =>
          window.dispatchEvent(
            new CustomEvent("campus:session-updated", { detail }),
          ),
        session,
      );
      await page
        .getByRole("heading", { name: "Esto es lo que pude revisar." })
        .waitFor();
      assert.equal(statusCalls, antesReintento + 1);
      // El resumen semanal aún no está listo: el siguiente evento reintenta solo
      // /week, sin vaciar la pantalla ni borrar lo escrito.
      failWeek = true;
      await page.goto(base + "/app/novedades/");
      for (let i = 0; i < 50 && !weekFailed; i++)
        await page.waitForTimeout(100);
      assert.ok(weekFailed >= 1);
      const apodoSemana = page.getByLabel("Mi apodo");
      await apodoSemana.fill("Ale");
      failWeek = false;
      const antesSemana = statusCalls;
      await page.evaluate(
        (detail) =>
          window.dispatchEvent(
            new CustomEvent("campus:session-updated", { detail }),
          ),
        session,
      );
      await page
        .getByRole("heading", { name: "Esto es lo que pude revisar." })
        .waitFor();
      assert.equal(statusCalls, antesSemana);
      assert.equal(await apodoSemana.inputValue(), "Ale");
      // Un evento de sesión llega mientras el primer /week sigue en vuelo: la
      // lectura nueva no se salta por la anterior y el resumen termina cargando.
      weekDelay = 1500;
      const empezadas = weekStarted;
      await page.goto(base + "/app/novedades/");
      for (let i = 0; i < 50 && weekStarted === empezadas; i++)
        await page.waitForTimeout(100);
      assert.ok(weekStarted > empezadas);
      weekDelay = 0;
      await page.evaluate(
        (detail) =>
          window.dispatchEvent(
            new CustomEvent("campus:session-updated", { detail }),
          ),
        session,
      );
      await page
        .getByRole("heading", { name: "Esto es lo que pude revisar." })
        .waitFor({ timeout: 8000 });
      assert.deepEqual(errors, []);
      console.log(
        JSON.stringify({
          width,
          weekInFlightRace: true,
          retryWeekWithoutReset: true,
          retryAfterFailure: true,
          copy: true,
          preferences: true,
          noAutomaticPermission: true,
          escapedContent: true,
          deletion: true,
          accountIsolation: true,
          noOverflow: true,
        }),
      );
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
