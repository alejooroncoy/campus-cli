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
    // Cursos sin cronograma con fechas: se dicen, para que no parezcan semanas libres.
    uncovered: [
      { courseId: "c9", course: "Matemática Computacional - Virtual", reason: "no_syllabus" },
    ],
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
        courseId: "c2",
        course: "Otro curso",
        title: "Avance 4",
        what: "entrega",
        studentAction: true,
        when: { kind: "date", text: "Viernes 25 septiembre" },
        from: "2026-09-25",
        to: "2026-09-25",
        bucket: "this_week",
        inBlackboard: true,
        done: false,
        next: true,
        after: null,
        dueAt: "2026-09-26T04:59:00.000Z",
      },
      {
        courseId: "c1",
        course: "Curso de prueba",
        title: "TP1",
        evidenceIds: ["e1"],
        source: "schedule",
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
        title: "Entrega del domingo",
        what: "entrega",
        studentAction: true,
        when: { kind: "date", text: "domingo 4 de octubre 11:30 p.m." },
        from: "2026-10-04",
        to: "2026-10-04",
        bucket: "next_week",
        inBlackboard: true,
        done: false,
        next: false,
        after: null,
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
        title: "Examen parcial",
        what: "evaluación",
        studentAction: true,
        when: { kind: "week", text: "Semana 9" },
        from: "2026-10-19",
        to: "2026-10-25",
        bucket: "later",
        inBlackboard: true,
        done: false,
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
      // Así lo guardaban los avisos antiguos: nombre interno, fecha como estado y entidades.
      title: "ultraDocumentBody",
      status: "2026-08-16T17:55:38.570Z",
      text: "Tópicos: · &nbsp;&nbsp;&nbsp; Planificar la gestión de los Riesgos.",
      source: "blackboard_list_contents",
    },
  },
  {
    id: "ev3",
    kind: "material_changed",
    meaning: "record_changed",
    detectedAt: "2026-11-09T13:00:00Z",
    fact: {
      id: "material:y",
      kind: "material",
      course: "Curso de prueba",
      title: "ultraDocumentBody",
      status: "2026-11-16T21:33:37.230Z",
      text: "Control &amp; Monitoreo:\n&nbsp;&nbsp;Validar el alcance. Usa 0 < x < 10 y x > 2, y escribe &lt;section&gt; como ejemplo.",
      source: "blackboard_list_contents",
    },
  },
  {
    id: "ev4",
    kind: "mail_published",
    meaning: "record_added",
    detectedAt: "2026-11-09T13:00:00Z",
    fact: {
      id: "mail:" + "a".repeat(64),
      kind: "mail",
      course: "Correo de la UPC",
      title: "Revisa la constancia solicitada y el canal oficial para entregarla.",
      status: "action",
      text: "documents",
      deadline: "2026-11-27",
      // Un enlace que no es de Outlook nunca se muestra.
      locator: "https://evil.test/mail",
      source: "outlook:important",
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
      calendarUrl = null,
      calendarCalls = [],
      outlook = { available: true, enabled: false, policy: "upc-important-mail-v3", permission: "Autorizo a Campus a revisar vistas previas de mis correos de prueba.", connection: "not_connected" },
      outlookCalls = [],
      outlookPolls = 0,
      outlookSlowGet = 0,
      outlookSilent = true,
      outlookFailGet = false,
      statusCalls = 0,
      failNotices = false,
      noticesFailed = 0,
      failWeek = false,
      weekAlt = false,
      weeklyNotice = false,
      weekFailed = 0,
      weekDelay = 0,
      weekStarted = 0,
      pageCalls = 0,
      pageOn = false;
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
      const statusBody = () => ({
        available: true,
        status: "active",
        preferences,
        nickname,
        suggestedNickname: "Alejo",
        lastSuccessAt: "2026-11-09T13:00:00Z",
        coverage: { complete: false },
        pushPublicKey: "fake-public-key",
        calendarUrl,
        // Los correos importantes llegan con el estado: Novedades no los pide aparte.
        outlook,
      });
      if (path === "/api/app/proactive/status") {
        statusCalls++;
        return json(statusBody());
      }
      // La página entera en una consulta. Por defecto el relay "no puede armarla" y se
      // usan las consultas de siempre; con pageOn responde todo junto.
      if (/^\/api\/app\/proactive\/page(\/[0-9a-f-]{36})?$/.test(path)) {
        pageCalls++;
        if (!pageOn)
          return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "PAGE_NOT_READY" }) });
        const conAviso = path.endsWith("/" + noticeId);
        return json({
          status: statusBody(),
          notices: [{ id: noticeId, title: "Ya preparé tu semana", createdAt: "2026-11-09T13:00:00Z", read: false, contextId }],
          nextCursor: null,
          notice: conAviso ? { notice: { id: noticeId, contextId }, events: weeklyNotice ? [] : events } : null,
          context: prepared,
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
            : { notice: { id: noticeId, contextId }, events: weeklyNotice ? [] : events },
        );
      if (path === "/api/app/proactive/week" && weekAlt)
        return json({
          ...prepared,
          upcoming: { ...prepared.upcoming, items: [prepared.upcoming.items[0]] },
        });
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
      if (path === "/api/app/proactive/calendar") {
        const body = method === "POST" ? JSON.parse(route.request().postData() || "{}") : {};
        calendarCalls.push(method + (body.reset ? " reset" : ""));
        if (method === "DELETE") calendarUrl = null;
        else if (!calendarUrl || body.reset)
          calendarUrl = "https://campuscli.com/cal/" + "T".repeat(40) + calendarCalls.length + ".ics";
        return json({ calendarUrl });
      }
      // Correos importantes de la UPC: permiso con su texto, conexión con Microsoft y quitar.
      if (path === "/api/app/proactive/outlook") {
        const body = method === "POST" ? JSON.parse(route.request().postData() || "{}") : {};
        outlookCalls.push(method === "POST" ? "POST " + JSON.stringify(body) : method);
        if (method === "POST") {
          if (body.consent !== true || body.policy !== outlook.policy)
            return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "OUTLOOK_POLICY_CHANGED" }) });
          outlook = { ...outlook, enabled: true };
        }
        if (method === "DELETE") outlook = { ...outlook, enabled: false, connection: "not_connected" };
        if (method === "GET" && outlookFailGet)
          return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "PROACTIVE_UNAVAILABLE" }) });
        // Respuesta atrasada: el estado de cuando se pidió, ya conectado, llega tarde.
        if (method === "GET" && outlookSlowGet) {
          const stale = { ...outlook, connection: "connected" };
          await new Promise((r) => setTimeout(r, outlookSlowGet));
          return json(stale);
        }
        // Microsoft termina después de la primera consulta de espera.
        if (method === "GET" && outlook.connection === "pending_login" && ++outlookPolls > 1) outlook = { ...outlook, connection: "connected" };
        return json(outlook);
      }
      if (path === "/api/app/proactive/outlook/connect" && method === "POST") {
        outlookCalls.push("CONNECT");
        outlook = { ...outlook, connection: "pending_login" };
        outlookPolls = 0;
        // Con la sesión de Microsoft de Campus va sola (silent); sin ella, hay que entrar.
        return json({ status: "pending_login", loginUrl: "https://www.browserbase.com/devtools-internal/fixture", ...(outlookSilent ? { silent: true } : {}) });
      }
      if (path === "/api/app/proactive/data" && method === "DELETE") {
        deleted++;
        return json({ status: "disabled" });
      }
      return json({});
    });
    try {
      // El detalle (ajustes, cursos, lo que se revisó) está detrás de un botón.
      const openDetail = async () => {
        const boton = page.getByRole("button", { name: /Ajustes de avisos/ });
        const detalle = page.getByRole("heading", { name: "Ajustes de avisos" });
        await boton.or(detalle).first().waitFor();
        if (await boton.count()) await boton.click();
      };
      // Desde el enlace del correo no debe verse, ni un momento, la bienvenida ni los ajustes.
      await page.addInitScript(() => {
        window.__campuFlash = [];
        new MutationObserver(() => {
          for (const sel of [".campu-heading", ".campu-status"])
            if (document.querySelector(sel) && !window.__campuFlash.includes(sel)) window.__campuFlash.push(sel);
        }).observe(document, { childList: true, subtree: true });
      });
      const pedidas = [];
      const anotar = (req) => {
        const u = new URL(req.url());
        if (u.pathname.startsWith("/api/app/")) pedidas.push(req.method() + " " + u.pathname);
      };
      page.on("request", anotar);
      await page.goto(base + "/app/novedades/" + noticeId + "/");
      // Un aviso de cambios abre con el cambio primero, no con los ajustes.
      const cambios = page.locator(".campu-home .campu-changes");
      await cambios.waitFor();
      page.off("request", anotar);
      // Ninguna consulta rebota por la barra final, y el aviso y su semana se piden una sola vez.
      assert.deepEqual(pedidas.filter((r) => !r.endsWith("/")), [], "todas con barra final");
      for (const ruta of ["/api/app/proactive/status/", "/api/app/proactive/notices/" + noticeId + "/", "/api/app/proactive/contexts/" + contextId + "/"])
        assert.equal(pedidas.filter((r) => r === "GET " + ruta).length, 1, ruta);
      // Si el adelanto falla por la red, la página lo vuelve a pedir y abre el reporte igual.
      let cortes = 0;
      const cortar = (route) => (cortes++ === 0 ? route.abort() : route.fallback());
      await page.route("**/api/app/proactive/notices/" + noticeId + "/", cortar);
      await page.goto(base + "/app/novedades/" + noticeId + "/");
      await cambios.waitFor();
      await page.unroute("**/api/app/proactive/notices/" + noticeId + "/", cortar);
      assert.ok(cortes >= 2, "se volvió a pedir el aviso");
      // Con el relay armando la página: una sola consulta trae el reporte entero, sin
      // pedir estado, lista, aviso ni semana por separado.
      await page.evaluate(() => localStorage.removeItem("campu_report_v1"));
      pageOn = true;
      const enUna = [];
      const anotarUna = (req) => {
        const u = new URL(req.url());
        if (u.pathname.startsWith("/api/app/proactive/")) enUna.push(req.method() + " " + u.pathname);
      };
      page.on("request", anotarUna);
      await page.goto(base + "/app/novedades/" + noticeId + "/");
      await cambios.waitFor();
      await page.waitForTimeout(300);
      page.off("request", anotarUna);
      pageOn = false;
      assert.deepEqual(
        enUna.filter((r) => r.startsWith("GET ")),
        ["GET /api/app/proactive/page/" + noticeId + "/"],
        "una sola consulta de lectura",
      );
      assert.ok(await page.locator(".campu-upcoming").count(), "con su semana");
      // Si /page falla por la red, no se vuelve a pedir: se usan las consultas de siempre.
      const pedidasCorte = [];
      const anotarCorte = (req) => {
        const u = new URL(req.url());
        if (u.pathname.startsWith("/api/app/proactive/")) pedidasCorte.push(req.method() + " " + u.pathname);
      };
      const cortarPagina = (route) => route.abort();
      await page.route("**/api/app/proactive/page/**", cortarPagina);
      page.on("request", anotarCorte);
      await page.goto(base + "/app/novedades/" + noticeId + "/");
      await cambios.waitFor();
      page.off("request", anotarCorte);
      await page.unroute("**/api/app/proactive/page/**", cortarPagina);
      assert.equal(pedidasCorte.filter((r) => r === "GET /api/app/proactive/page/" + noticeId + "/").length, 1, "/page se pide una vez");
      // Servidor lento y la sesión revalidándose a mitad de la carga: la carga en curso
      // no se reinicia, así que cada consulta sale una sola vez y el reporte termina.
      await page.evaluate(() => localStorage.removeItem("campu_report_v1"));
      const pedidasLentas = [];
      const anotarLentas = (req) => {
        const u = new URL(req.url());
        if (u.pathname.startsWith("/api/app/proactive/")) pedidasLentas.push(req.method() + " " + u.pathname);
      };
      const muyLento = async (route) => { await new Promise((r) => setTimeout(r, 1500)); return route.fallback(); };
      await page.route("**/api/app/proactive/**", muyLento);
      page.on("request", anotarLentas);
      await page.goto(base + "/app/novedades/" + noticeId + "/");
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(400);
        await page.evaluate((detail) => window.dispatchEvent(new CustomEvent("campus:session-updated", { detail })), session);
      }
      await cambios.waitFor();
      page.off("request", anotarLentas);
      await page.unroute("**/api/app/proactive/**", muyLento);
      for (const ruta of ["/api/app/proactive/status/", "/api/app/proactive/notices/" + noticeId + "/"])
        assert.equal(pedidasLentas.filter((r) => r === "GET " + ruta).length, 1, "sin reinicios: " + ruta);
      // Segunda visita: el reporte guardado aparece al instante, aunque el servidor tarde.
      assert.ok(await page.evaluate(() => localStorage.getItem("campu_report_v1")), "quedó guardado");
      const lento = async (route) => { await new Promise((r) => setTimeout(r, 4000)); return route.fallback(); };
      await page.route("**/api/app/proactive/**", lento);
      const inicio = Date.now();
      await page.goto(base + "/app/novedades/" + noticeId + "/");
      await cambios.waitFor({ timeout: 3000 });
      assert.ok(Date.now() - inicio < 3000, "abre con lo guardado sin esperar al servidor");
      await page.unroute("**/api/app/proactive/**", lento);
      // Lo guardado de otra cuenta se borra en cuanto la sesión dice quién eres.
      await page.evaluate(() => {
        const g = JSON.parse(localStorage.getItem("campu_report_v1"));
        localStorage.setItem("campu_report_v1", JSON.stringify({ ...g, owner: "campus:otra-cuenta" }));
      });
      await page.goto(base + "/app/novedades/" + noticeId + "/");
      await cambios.waitFor();
      assert.equal(
        JSON.parse(await page.evaluate(() => localStorage.getItem("campu_report_v1")) ?? "{}").owner,
        session.analyticsId,
        "lo de otra cuenta se reemplaza por el reporte propio",
      );
      // Lo guardado nunca lleva el pedido preparado para la IA.
      assert.ok(!(await page.evaluate(() => localStorage.getItem("campu_report_v1") ?? "")).includes('"prompt"'), "sin pedido para la IA");
      assert.deepEqual(await page.evaluate(() => window.__campuFlash), [], "nada parpadea antes del reporte");
      assert.equal(await page.locator(".campu-loading").count(), 0);
      const titularCambio = (await page.locator(".campu-home h1").innerText()).replace(/\s+/g, " ");
      assert.match(titularCambio, /^(Encontré \d+ cambios en tus cursos\.|Cambió |Publicaron |Ya no aparece|Hay un anuncio)/, titularCambio);
      assert.equal(await page.getByRole("heading", { name: "Ajustes de avisos" }).count(), 0);
      assert.match(await cambios.innerText(), /nota oficial en mi upc/i, "el cambio se ve sin abrir nada");
      // Y el orden: el cambio va antes que lo que viene.
      const orden = await page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const c = q(".campu-home .campu-changes"), w = q(".campu-home .campu-upcoming");
        return !w || Boolean(c.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      assert.equal(orden, true, "el cambio va primero");
      await openDetail();
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
      // Lo que viene: Campito lo cuenta en una frase y la tira muestra cinco celdas.
      const viene = page.locator(".campu-upcoming");
      await viene.locator(".campu-says").waitFor();
      const frase = (await viene.locator(".campu-says p").innerText()).replace(/\s+/g, " ");
      assert.ok(frase.startsWith("Esta semana tienes 2 entregas"), frase);
      // Un domingo sigue siendo de su semana: la próxima tiene dos cosas.
      assert.ok(frase.endsWith("La próxima, 2 entregas."), frase);
      const celdas = viene.getByRole("tab");
      assert.equal(await celdas.count(), 5);
      assert.deepEqual(
        await celdas.evaluateAll((l) => l.map((b) => b.disabled)),
        [false, false, true, true, false],
      );
      // Abre en la primera celda con algo; el título con HTML queda como texto.
      assert.equal(await celdas.nth(0).getAttribute("aria-selected"), "true");
      assert.ok(await viene.locator("li").getByText("TB2", { exact: true }).count());
      assert.equal(await viene.getByText("TB1", { exact: true }).count(), 0);
      await viene.getByRole("tab", { name: /Próxima/ }).click();
      assert.ok(await viene.locator("li").getByText("TP1", { exact: true }).count());
      const proxima = (await viene.locator("[role=tabpanel]").innerText()).replace(/\s+/g, " ");
      assert.match(proxima, /28 set–4 oct/, proxima);
      assert.ok(await viene.locator("li").getByText("Entrega del domingo", { exact: true }).count());
      assert.match(proxima, /Entrega del domingo.*4 oct/, proxima);
      assert.ok(await viene.getByText("Aún sin publicar").count());
      await viene.getByRole("tab", { name: /Sig\. semanas/ }).click();
      assert.ok(await viene.locator("li").getByText("Examen parcial", { exact: true }).count());
      assert.equal(await viene.locator("li").getByText("TP1", { exact: true }).count(), 0);
      // Lo que no tiene fecha no entra en la tira: va en una línea aparte.
      assert.equal(await viene.locator("li").getByText("Examen final", { exact: true }).count(), 0);
      assert.equal(
        (await viene.locator(".campu-undated").innerText()).trim(),
        "Sin fecha confirmada: Examen final",
      );
      // Un curso sin cronograma se nombra con su motivo, sin el sufijo "- Virtual".
      const sinCronograma = (await viene.locator(".campu-uncovered").innerText()).replace(/\s+/g, " ");
      assert.match(sinCronograma, /solo te aviso lo que publiquen en Blackboard/, sinCronograma);
      assert.match(sinCronograma, /Matemática Computacional no encontré su sílabo ni un cronograma/, sinCronograma);
      assert.equal(await page.evaluate(() => !!window.injected), false);
      // Un material retirado se resume en una línea; no se lista página por página.
      const cambiosTexto = (await page.locator(".campu-changes").first().innerText()).replace(/[^\S\n]+/g, " ");
      assert.match(cambiosTexto, /Tu profe retiró o reorganizó una página de material\. No necesitas hacer nada\./, cambiosTexto);
      assert.equal(await page.getByText("Ya no aparece en la fuente", { exact: false }).count(), 0);
      assert.ok(!cambiosTexto.includes("Planificar la gestión de los Riesgos"), cambiosTexto);
      // Un material cambiado de un aviso antiguo: sin nombre interno, sin fecha como estado y sin entidades.
      assert.match(cambiosTexto, /Página del curso/, cambiosTexto);
      assert.match(cambiosTexto, /Control & Monitoreo:\nValidar el alcance\./, cambiosTexto);
      // Comparaciones y ejemplos escritos por el profesor no se borran al limpiar.
      assert.ok(cambiosTexto.includes("Usa 0 < x < 10 y x > 2, y escribe <section> como ejemplo."), cambiosTexto);
      // Un correo de la UPC: qué hacer y hasta cuándo, sin estado ni categoría internos,
      // y el enlace solo va a Outlook.
      assert.match(cambiosTexto, /Correo de la UPC · Te pide hacer algo\s+Revisa la constancia solicitada/i, cambiosTexto);
      assert.match(cambiosTexto, /Hasta el viernes, 27 de noviembre|Hasta el viernes 27 de noviembre/, cambiosTexto);
      assert.ok(!/Estado: action|documents/.test(cambiosTexto), cambiosTexto);
      const enlaceCorreo = page.locator(".campu-changes").first().getByRole("link", { name: "Abrir Outlook" });
      assert.equal(await enlaceCorreo.getAttribute("href"), "https://outlook.cloud.microsoft/mail/");
      assert.equal(await page.locator('a[href^="https://evil.test"]').count(), 0);
      const pagina = await page.locator("body").innerText();
      for (const raro of ["ultraDocumentBody", "&nbsp;", "&amp;", "Estado: 2026-"]) assert.ok(!pagina.includes(raro), raro);
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
      await page.getByLabel("Por correo").uncheck();
      await page.getByRole("button", { name: "Guardar ajustes" }).click();
      await page
        .getByText("Listo. Reviso tus cursos", { exact: false })
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
      // Borrar deja el navegador sin reporte guardado, también si una carga termina después.
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => localStorage.getItem("campu_report_v1")), null, "sin reporte guardado tras borrar");
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
          .getByRole("button", { name: "Guardar ajustes" })
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
      // El fallo puede llegar por el adelanto antes de que la página escuche eventos:
      // se espera a que la página lo muestre para que el reintento no se pierda.
      await page.locator(".campu-alert").first().waitFor();
      failNotices = false;
      const antesReintento = statusCalls;
      await page.evaluate(
        (detail) =>
          window.dispatchEvent(
            new CustomEvent("campus:session-updated", { detail }),
          ),
        session,
      );
      // Con el aviso ya abierto, la vista pasa a la simple: el detalle se abre después.
      await page.locator(".campu-home").waitFor();
      await openDetail();
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
      // Sin semana preparada, los correos de la UPC siguen a mano para activarlos o quitarlos.
      await page.locator('.campu-cal-strip[data-strip="mail"], .campu-mail').first().waitFor();
      await openDetail();
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
      await openDetail();
      await page
        .getByRole("heading", { name: "Esto es lo que pude revisar." })
        .waitFor({ timeout: 8000 });
      // Vista simple: una frase, lo próximo y lo nuevo por día; el detalle, tras un botón.
      await page.clock.setFixedTime(new Date("2026-09-22T15:00:00-05:00"));
      await page.goto(base + "/app/novedades/");
      const home = page.locator(".campu-home");
      await home
        .locator("h1")
        .getByText("Esta semana tienes", { exact: false })
        .waitFor();
      const titular = (await home.locator("h1").innerText()).replace(/\s+/g, " ");
      assert.ok(titular.startsWith("Esta semana tienes 2 entregas"), titular);
      assert.equal(await page.evaluate(() => !!window.injected), false);
      // El calendario por semanas va arriba: esta semana, dos entregas de dos cursos con su hora.
      const cal = home.locator(".campu-upcoming");
      const tabs = cal.getByRole("tab");
      assert.equal(await tabs.first().getAttribute("aria-selected"), "true");
      const semana = (await cal.locator("[role=tabpanel]").innerText()).replace(/\s+/g, " ");
      // Un título con HTML se muestra limpio: ni se ejecuta ni se ven las etiquetas.
      assert.ok(semana.includes("TB2") && !semana.includes("<img"), semana);
      assert.equal((await page.locator("body").innerText()).includes("onerror"), false);
      assert.ok(semana.includes("Curso de prueba"), semana);
      assert.ok(semana.includes("Avance 4") && semana.includes("Otro curso"), semana);
      assert.match(semana, /En 3 días · 25 set · (11:59|23:59)/);
      assert.equal(await cal.locator("[role=tabpanel] .campu-item").count(), 2);
      // Una entrega publicada en Blackboard no dice que falte publicarla.
      // Con día exacto el recuadro trae ese día; con solo la semana, el rango y no el lunes.
      const chip = async (title) =>
        (await cal.locator(".campu-item", { hasText: title }).locator(".campu-chip").innerText())
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
      assert.match(await chip("Avance 4"), /^25 se[pt]/);
      assert.match(await chip("TB2"), /^21–27 se[pt]/);
      const avance = cal.locator(".campu-item", { hasText: "Avance 4" });
      await avance.locator(".campu-item-head").click();
      assert.equal(await avance.locator(".campu-item-more").getByText("Todavía no está como tarea").count(), 0);
      await avance.locator(".campu-item-head").click();
      // La próxima semana va en su pestaña: lo no publicado se dice y la hora del cronograma va en 24 h.
      await cal.getByRole("tab", { name: /Próxima/ }).click();
      const proximaSemana = (await cal.locator("[role=tabpanel]").innerText()).replace(/\s+/g, " ");
      assert.ok(/TP1.*Aún sin publicar/.test(proximaSemana), proximaSemana);
      assert.match(proximaSemana, /Entrega del domingo.*4 oct · 23:30/, proximaSemana);
      // Un rango que cruza de mes no se sale del recuadro.
      const cruce = cal.locator(".campu-item", { hasText: "TP1" }).locator(".campu-chip");
      assert.match((await cruce.innerText()).replace(/\s+/g, " ").trim().toLowerCase(), /^28–4 se[pt]–oct/);
      assert.ok(
        await cruce.evaluate((el) => [...el.children].every((c) => c.getBoundingClientRect().width <= el.clientWidth - 4)),
        "el mes no desborda",
      );
      // Por debajo de la columna lateral, WhatsApp va en una franja arriba del calendario
      // (sin Plus en esta prueba) que abre la misma tarjeta en una hoja y la devuelve al cerrar.
      const franja = page.locator("[data-wa-strip]");
      await franja.waitFor();
      assert.match(await franja.innerText(), /Tu semana en WhatsApp\s*Con Plus/);
      assert.ok((await franja.boundingBox()).y < (await home.boundingBox()).y, "la franja va antes del calendario");
      assert.ok((await franja.boundingBox()).height <= 48, "la franja ocupa una línea");
      // Con la franja, la tarjeta no se repite al final de la página.
      assert.equal(await page.locator(".novedades-extra [data-whatsapp-reminders]").isVisible(), false);
      await franja.click();
      const hoja = page.locator("[data-wa-sheet]");
      await hoja.locator("[data-whatsapp-reminders] [data-wa-upsell] a").waitFor();
      assert.equal(await hoja.evaluate((d) => d.open), true);
      await page.keyboard.press("Escape");
      await page.locator(".novedades-extra [data-whatsapp-reminders]").waitFor({ state: "attached" });
      assert.equal(await hoja.evaluate((d) => d.open), false);
      // Una entrega se abre para ver de dónde sale, con ratón y con teclado.
      const tp1 = cal.locator(".campu-item", { hasText: "TP1" });
      const cabeza = tp1.locator(".campu-item-head");
      assert.equal(await cabeza.getAttribute("aria-expanded"), "false");
      assert.equal(await tp1.locator(".campu-item-more").count(), 0);
      await cabeza.click();
      assert.equal(await cabeza.getAttribute("aria-expanded"), "true");
      const mas = (await tp1.locator(".campu-item-more").innerText()).replace(/\s+/g, " ");
      assert.ok(mas.includes("De dónde lo sé") && mas.includes("Sílabo oficial · Página 2"), mas);
      assert.ok(mas.includes("Semana 10: evaluación."), mas);
      assert.ok(mas.includes("Todavía no está como tarea en Blackboard"), mas);
      await cabeza.click();
      assert.equal(await cabeza.getAttribute("aria-expanded"), "false");
      await cabeza.focus();
      await page.keyboard.press("Enter");
      assert.equal(await cabeza.getAttribute("aria-expanded"), "true");
      await page.keyboard.press("Enter");
      assert.equal(await cabeza.getAttribute("aria-expanded"), "false");
      await tabs.first().click();
      // Los avisos van debajo del calendario, con su título.
      // Tus entregas en Google Calendar u Outlook: debajo de WhatsApp, con un enlace privado.
      // Con la franja (celular y pantallas medianas): su propia franja debajo de la de
      // WhatsApp, antes del calendario, que abre la tarjeta en una hoja inferior.
      const calFranja = page.locator('.novedades-main > .novedades-cal .campu-cal-strip[data-strip="calendar"]');
      await calFranja.waitFor();
      assert.equal(await page.locator(".campu-cal-sync:not(.campu-mail)").count(), 1, "una sola vez");
      const bajoFranja = await franja.boundingBox();
      const cajaCal = await calFranja.boundingBox();
      assert.ok(cajaCal.y >= bajoFranja.y + bajoFranja.height, "va debajo de la franja de WhatsApp");
      assert.ok(cajaCal.y < (await home.boundingBox()).y, "y antes del calendario");
      assert.ok(Math.abs(cajaCal.x - bajoFranja.x) < 2 && Math.abs(cajaCal.width - bajoFranja.width) < 2, "mismo ancho");
      assert.match(await calFranja.innerText(), /Tus entregas en tu calendario\s*Agregar/);
      if (process.env.CAL_SHOT_DIR && width === 390) await page.screenshot({ path: process.env.CAL_SHOT_DIR + "/celular-franjas.png" });
      const calHoja = page.locator('.campu-cal-sheet[data-sheet="calendar"]');
      assert.equal(await calHoja.isVisible(), false);
      await calFranja.click();
      await calHoja.waitFor();
      const sync = calHoja.locator(".campu-cal-sync");
      // Sin paso previo: cada calendario es un botón con su logo. El primer toque crea el
      // enlace y abre Google en una pestaña que se pidió antes de esperar al servidor.
      assert.deepEqual(
        await sync.locator(".campu-cal-sync-target").allInnerTexts(),
        ["Google Calendar", "Outlook", "iPhone o Mac", "Copiar enlace"],
      );
      await page.context().route("https://calendar.google.com/**", (r) =>
        r.fulfill({ status: 200, contentType: "text/html", body: "ok" }),
      );
      const [pestana] = await Promise.all([
        page.waitForEvent("popup"),
        sync.getByRole("button", { name: "Google Calendar" }).click(),
      ]);
      await pestana.waitForURL(/^https:\/\/calendar\.google\.com\//);
      const first = calendarUrl;
      assert.equal(pestana.url(), "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(first));
      assert.equal(await pestana.evaluate(() => window.opener), null, "sin acceso a Campus");
      await pestana.close();
      const google = sync.getByRole("link", { name: "Google Calendar" });
      await google.waitFor();
      assert.equal(
        await google.getAttribute("href"),
        "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(first),
      );
      assert.match(await sync.getByRole("link", { name: "Outlook", exact: true }).getAttribute("href"), /^https:\/\/outlook\.office\.com\/calendar\/0\/addfromweb\?url=https%3A%2F%2Fcampuscli\.com%2Fcal%2F/);
      assert.equal(await sync.getByRole("link", { name: "iPhone o Mac" }).getAttribute("href"), first.replace("https:", "webcal:"));
      await sync.getByRole("button", { name: "Copiar enlace" }).click();
      await sync.getByRole("status").waitFor();
      assert.equal(await page.evaluate(() => window.copies.at(-1)), first);
      // El enlace es una credencial: no queda en el reporte guardado del navegador.
      assert.ok(!(await page.evaluate(() => localStorage.getItem("campu_report_v1") ?? "")).includes("/cal/"), "sin enlace en caché");
      await sync.locator("summary", { hasText: "Tu enlace es privado" }).click();
      await sync.getByRole("button", { name: "Cambiar enlace" }).click();
      await sync.getByText(/tu enlace es nuevo/).waitFor();
      assert.notEqual(calendarUrl, first);
      assert.equal(await sync.getByRole("link", { name: "iPhone o Mac" }).getAttribute("href"), calendarUrl.replace("https:", "webcal:"));
      await sync.getByRole("button", { name: "Quitar" }).click();
      await sync.getByRole("button", { name: "Google Calendar" }).waitFor();
      assert.deepEqual(calendarCalls, ["POST", "POST reset", "DELETE"]);
      if (process.env.CAL_SHOT_DIR && width === 390) await page.screenshot({ path: process.env.CAL_SHOT_DIR + "/celular-hoja.png" });
      await calHoja.getByRole("button", { name: "Cerrar" }).click();
      await calHoja.waitFor({ state: "hidden" });
      // Correos importantes de la UPC: su franja va debajo de la del calendario. Un solo
      // toque acepta el permiso (con su texto a la vista) y conecta. Con la sesión de
      // Microsoft de Campus no se abre ninguna pestaña: la tarjeta pasa sola a «Activo».
      const correoFranja = page.locator('.novedades-main > .novedades-cal .campu-cal-strip[data-strip="mail"]');
      await correoFranja.waitFor();
      const cajaCorreo = await correoFranja.boundingBox();
      assert.ok(cajaCorreo.y >= cajaCal.y + cajaCal.height, "debajo de la franja del calendario");
      assert.ok(Math.abs(cajaCorreo.width - cajaCal.width) < 2, "mismo ancho");
      assert.match(await correoFranja.innerText(), /Correos de la UPC\s*Activar/);
      assert.ok(cajaCorreo.height <= cajaCal.height + 1, "una sola línea, como la del calendario");
      await correoFranja.click();
      const correoHoja = page.locator('.campu-cal-sheet[data-sheet="mail"]');
      await correoHoja.waitFor();
      const activar = correoHoja.getByRole("button", { name: "Aceptar y activar" });
      assert.equal(await correoHoja.getByRole("checkbox").count(), 0, "un solo toque, sin casilla");
      assert.match(await correoHoja.innerText(), /Al aceptar autorizas lo que explica «Qué reviso y qué no»/);
      await correoHoja.locator("summary", { hasText: "Qué reviso y qué no" }).click();
      await correoHoja.getByText(outlook.permission).waitFor();
      if (process.env.CAL_SHOT_DIR && width === 390) await page.screenshot({ path: process.env.CAL_SHOT_DIR + "/celular-correos.png" });
      await page.context().route("https://www.browserbase.com/**", (r) =>
        r.fulfill({ status: 200, contentType: "text/html", body: "Microsoft" }),
      );
      outlookCalls.length = 0;
      let pestanas = 0;
      const contar = () => pestanas++;
      page.on("popup", contar);
      await activar.click();
      await correoHoja.getByText(/Conectando tu Outlook de la UPC con tu cuenta de Campus/).waitFor();
      if (process.env.CAL_SHOT_DIR && width === 390) await page.screenshot({ path: process.env.CAL_SHOT_DIR + "/celular-correos-conectando.png" });
      await correoHoja.getByText(/^Activo\./).waitFor({ timeout: 15000 });
      page.off("popup", contar);
      assert.equal(pestanas, 0, "sin abrir ninguna pestaña");
      assert.match(await correoFranja.innerText(), /Tus correos de la UPC\s*Ajustes/);
      assert.deepEqual(outlookCalls.slice(0, 2), ['POST {"consent":true,"policy":"upc-important-mail-v3"}', "CONNECT"]);
      if (process.env.CAL_SHOT_DIR && width === 390) await page.screenshot({ path: process.env.CAL_SHOT_DIR + "/celular-correos-activo.png" });
      await correoHoja.getByRole("button", { name: "Desactivar y borrar avisos" }).click();
      await correoHoja.getByRole("button", { name: "Aceptar y activar" }).waitFor();
      assert.equal(outlookCalls.at(-1), "DELETE");
      if (width === 390) {
        // Sin la sesión de Microsoft de Campus: aparece «Entrar con Microsoft», que abre
        // la página de inicio de sesión con el toque del alumno y sin acceso a Campus.
        outlookSilent = false;
        await correoHoja.getByRole("button", { name: "Aceptar y activar" }).click();
        const entrar = correoHoja.getByRole("link", { name: "Entrar con Microsoft" });
        await entrar.waitFor();
        assert.equal(await entrar.getAttribute("href"), "https://www.browserbase.com/devtools-internal/fixture");
        assert.match(await entrar.getAttribute("rel"), /noopener/);
        const [microsoft] = await Promise.all([page.waitForEvent("popup"), entrar.click()]);
        await microsoft.waitForURL(/^https:\/\/www\.browserbase\.com\//);
        assert.equal(await microsoft.evaluate(() => window.opener), null, "sin acceso a Campus");
        await microsoft.close();
        await correoHoja.getByText(/^Activo\./).waitFor({ timeout: 20000 });
        await correoHoja.getByRole("button", { name: "Desactivar y borrar avisos" }).click();
        await correoHoja.getByRole("button", { name: "Aceptar y activar" }).waitFor();
        // Desactivar mientras una consulta de espera sigue en curso: su respuesta atrasada
        // no vuelve a mostrar Outlook como activo ni sigue preguntando.
        await correoHoja.getByRole("button", { name: "Aceptar y activar" }).click();
        await correoHoja.getByRole("link", { name: "Entrar con Microsoft" }).waitFor();
        outlookSlowGet = 3000;
        await page.waitForRequest((r) => r.method() === "GET" && new URL(r.url()).pathname === "/api/app/proactive/outlook/", { timeout: 10000 });
        await correoHoja.getByRole("button", { name: "Desactivar" }).click();
        await correoHoja.getByRole("button", { name: "Aceptar y activar" }).waitFor();
        const antes = outlookCalls.length;
        await page.waitForTimeout(outlookSlowGet + 5000);
        assert.equal(await correoHoja.getByText(/^Activo\./).count(), 0, "la respuesta atrasada no reactiva la tarjeta");
        assert.equal(await correoHoja.getByRole("button", { name: "Aceptar y activar" }).count(), 1);
        assert.equal(outlookCalls.slice(antes).filter((c) => c === "GET").length, 0, "no sigue preguntando");
        outlookSlowGet = 0;
        outlookSilent = true;
        // Va sola pero las consultas fallan: a los 45 s vuelven «Entrar con Microsoft» y
        // «Desactivar»; la tarjeta no se queda en «Conectando» sin salida.
        outlookFailGet = true;
        await correoHoja.getByRole("button", { name: "Aceptar y activar" }).click();
        await correoHoja.getByText(/Conectando tu Outlook de la UPC con tu cuenta de Campus/).waitFor();
        await correoHoja.getByRole("link", { name: "Entrar con Microsoft" }).waitFor({ timeout: 60000 });
        assert.equal(await correoHoja.getByRole("button", { name: "Desactivar" }).count(), 1);
        outlookFailGet = false;
        await correoHoja.getByRole("button", { name: "Desactivar" }).click();
        await correoHoja.getByRole("button", { name: "Aceptar y activar" }).waitFor();
      }
      await correoHoja.getByRole("button", { name: "Cerrar" }).click();
      await correoHoja.waitFor({ state: "hidden" });
      // En escritorio, con la columna de WhatsApp, pasa debajo de la tarjeta.
      if (width === 1100) {
        await page.setViewportSize({ width: 1280, height: 844 });
        const lateral = page.locator(".novedades-extra .campu-cal-sync:not(.campu-mail)");
        await lateral.waitFor();
        assert.equal(await page.locator(".campu-cal-sync:not(.campu-mail)").count(), 1, "una sola vez en escritorio");
        // Correos importantes: su tarjeta, debajo de la del calendario, sin franja.
        const correoLateral = page.locator(".novedades-extra .campu-mail");
        await correoLateral.waitFor();
        assert.equal(await page.locator(".campu-mail").count(), 1, "una sola tarjeta de correos");
        const cajaLateral = await lateral.boundingBox(), cajaCorreoLateral = await correoLateral.boundingBox();
        assert.ok(cajaCorreoLateral.y >= cajaLateral.y + cajaLateral.height + 8, "debajo del calendario, separada");
        const tarjeta = await page.locator(".novedades-extra [data-whatsapp-reminders]").boundingBox();
        const caja = await lateral.boundingBox();
        assert.ok(caja.y >= tarjeta.y + tarjeta.height, "debajo de la tarjeta de WhatsApp");
        assert.ok(Math.abs(caja.x - tarjeta.x) < 2 && caja.width <= tarjeta.width + 1, "en la misma columna");
        if (process.env.CAL_SHOT_DIR) await page.locator(".novedades-extra").screenshot({ path: process.env.CAL_SHOT_DIR + "/escritorio.png" });
        await page.setViewportSize({ width, height: 844 });
        await calFranja.waitFor();
      }
      assert.equal(await home.getByRole("heading", { name: "Avisos que te mandé" }).count(), 1);
      assert.equal(await home.locator(".campu-day h2").first().innerText(), "Hoy");
      assert.equal(
        await home.getByRole("link", { name: /Ya preparé tu semana/ }).getAttribute("href"),
        "/app/novedades/" + noticeId + "/",
      );
      // Antes se guardaron las preferencias sin correo.
      assert.equal(
        await home.locator(".campu-home-foot span").innerText(),
        preferences.email ? "Te aviso por correo" : "Sin avisos por correo",
      );
      // La cobertura incompleta no se esconde con el detalle.
      assert.ok(await home.getByText("Me faltan fuentes por revisar", { exact: false }).count());
      // Nada de ajustes ni de detalle hasta que se pidan.
      const ajustes = page.getByRole("heading", { name: "Ajustes de avisos" });
      assert.equal(await ajustes.count(), 0);
      assert.equal(await page.locator(".campu-context").count(), 0);
      await home.getByRole("button", { name: /Ajustes de avisos/ }).click();
      await ajustes.waitFor();
      await home.getByRole("button", { name: /Ocultar ajustes/ }).click();
      assert.equal(await ajustes.count(), 0);
      // El resumen cambia con la celda elegida ya vacía: vuelve a la primera con algo.
      weeklyNotice = true;
      await page.goto(base + "/app/novedades/" + noticeId + "/");
      // El aviso sin cambios (como el del correo) abre la vista simple, con el detalle plegado.
      await page.locator(".campu-home").waitFor();
      assert.equal(await page.locator(".campu-heading").count(), 0);
      await openDetail();
      const cambio = page.locator(".campu-upcoming");
      await cambio.getByRole("tab", { name: /Próxima/ }).click();
      weekAlt = true;
      await page.getByRole("button", { name: "Ver mi resumen de esta semana" }).click();
      await cambio.locator("li").getByText("TB2", { exact: true }).waitFor();
      weekAlt = false;
      // Solo las entregas de la tira: la lista de cursos sin cronograma va aparte.
      assert.equal(await cambio.locator("[role=tabpanel] > li").count(), 1);
      assert.equal(await cambio.getByRole("tab").first().getAttribute("aria-selected"), "true");
      weeklyNotice = false;
      assert.deepEqual(errors, []);
      console.log(
        JSON.stringify({
          width,
          weekInFlightRace: true,
          retryWeekWithoutReset: true,
          retryAfterFailure: true,
          simpleHome: true,
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
