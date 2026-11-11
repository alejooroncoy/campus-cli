// Servidor e2e de la muestra de invitado: el handler REAL de campus-profes (PR de backend)
// con el sitio compilado y un agente falso. Sin login ni IA.
// - Sin CAMPUS_E2E_DATABASE_URL: reglas (1 por cookie, 1 por IP, tope diario) en memoria.
// - Con CAMPUS_E2E_DATABASE_URL (solo localhost): el store REAL sobre PostgreSQL, en un
//   esquema temporal con las migraciones del backend; se borra al salir.
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const port = Number(process.env.CAMPUS_E2E_PORT ?? 4331);
const origin = `http://127.0.0.1:${port}`;
process.env.CAMPUS_APP_ORIGIN = origin;
const profesDir = resolve(process.env.CAMPUS_PROFES_DIR ?? "/Users/USER/alejo/campus-profes-guest-sample");
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const { createAppHandler } = await import(pathToFileURL(resolve(profesDir, "src/app/http.ts")).href);

type Reason = "already_used" | "ip_used" | "daily_cap";
const state = {
  config: { enabled: true, dailyCap: 150, maxOutputTokens: 700, ipSalt: "sal-e2e", ipHeader: "x-real-ip" },
  guests: new Set<string>(), ips: new Set<string>(), served: 0,
  agentCalls: 0, agentMessages: [] as string[], events: [] as any[],
};
const block = (guestId: string | null, ipHash: string, cap: number): Reason | null => {
  if (guestId && state.guests.has(guestId)) return "already_used";
  if (state.ips.has(ipHash)) return "ip_used";
  if (state.served >= cap) return "daily_cap";
  return null;
};

// ---- PostgreSQL real (opcional) ----
let db: any = null, admin: any = null, schema = "";
const databaseUrl = process.env.CAMPUS_E2E_DATABASE_URL;
let realStore: any = null;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("The e2e fixture only runs against an explicitly local database");
  const requireFromBackend = createRequire(resolve(profesDir, "package.json"));
  const postgres = (await import(pathToFileURL(requireFromBackend.resolve("postgres")).href)).default;
  const { appStore } = await import(pathToFileURL(resolve(profesDir, "src/app/store.ts")).href);
  schema = `campus_e2e_${randomUUID().replaceAll("-", "")}`;
  admin = postgres(url.toString(), { onnotice: () => {} });
  await admin`create schema ${admin(schema)}`;
  db = postgres(url.toString(), { connection: { search_path: schema }, onnotice: () => {}, max: 4 });
  await db.unsafe("create table account(id integer primary key);");
  for (const file of ["151_campus_app_ai.sql", "152_campus_app_profes_chat.sql", "153_campus_app_conversations.sql", "209_guest_sample.sql"]) {
    await db.unsafe(await readFile(resolve(profesDir, "sql", file), "utf8"));
  }
  realStore = appStore(db);
}

const handler = createAppHandler({} as any, {
  session: async () => null,
  ready: () => true,
  guestSample: { config: () => state.config, emit: (event: any, distinctId: string) => { state.events.push({ event, distinctId }); } },
  store: {
    universities: async () => [{ id: 1, name: "Universidad Peruana de Ciencias Aplicadas", shortName: "UPC" }],
    conversations: async () => [], guestConversations: async () => [], claimGuestHistory: async () => {},
    guestUsage: async () => ({ used: 0, limit: 5, remaining: 5, period: "trial" }),
    ...(realStore ? {
      guestSampleStatus: realStore.guestSampleStatus,
      reserveGuestSample: realStore.reserveGuestSample,
      finishGuest: realStore.finishGuest,
    } : {
      guestSampleStatus: async (guestId: string | null, ipHash: string, cap: number) => block(guestId, ipHash, cap),
      reserveGuestSample: async (guestId: string, ipHash: string, cap: number) => {
        const reason = block(guestId, ipHash, cap);
        if (reason) return { status: "blocked", reason };
        state.guests.add(guestId); state.ips.add(ipHash); state.served++;
        return { status: "reserved", id: randomUUID() };
      },
      finishGuest: async () => ({ conversationId: randomUUID(), title: "Consulta de muestra" }),
    }),
  } as any,
  agent: (async (message: string) => {
    state.agentCalls++; state.agentMessages.push(message);
    return { text: "Respuesta pública del catálogo (e2e).", usage: { inputTokens: 10, outputTokens: 5 }, model: "openai/gpt-4o-mini" };
  }) as any,
});

const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2" };
const json = (res: any, data: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", origin).pathname;
  if (path === "/__e2e/state") { json(res, { ...state, guests: [...state.guests], ips: [...state.ips], database: Boolean(db) }); return; }
  if (path === "/__e2e/db") {
    if (!db) { json(res, null); return; }
    json(res, {
      requests: await db`select guest_id, plan, status, ip_hash, input_tokens, output_tokens, model, error_code from campus_app_ai_request order by created_at`,
      conversations: (await db`select count(*)::int as n from campus_app_conversation`)[0].n,
      messages: await db`select role, content from campus_app_profes_message order by id`,
      indexes: (await db`select indexname from pg_indexes where schemaname = ${schema} and tablename = 'campus_app_ai_request' order by 1`).map((r: any) => r.indexname),
    }); return;
  }
  if (path === "/__e2e/config" && req.method === "POST") {
    let body = ""; for await (const chunk of req) body += chunk;
    Object.assign(state.config, JSON.parse(body || "{}"));
    json(res, state.config); return;
  }
  if (path === "/__e2e/reset" && req.method === "POST") {
    state.guests.clear(); state.ips.clear(); state.served = 0; state.agentCalls = 0; state.agentMessages = []; state.events = [];
    if (db) await db.unsafe("truncate campus_app_profes_message, campus_app_conversation, campus_app_ai_request cascade;");
    res.writeHead(200); res.end("ok"); return;
  }
  if (await handler(req, res, path)) return;
  try {
    if (req.method !== "GET") throw new Error("GET only");
    let file = resolve(root, `.${decodeURIComponent(path)}`);
    if (!file.startsWith(resolve(root) + sep)) throw new Error("invalid path");
    // Las conversaciones se sirven con la misma página del asistente.
    if (/^\/app\/asistente\/c\/[0-9a-f-]+\/?$/.test(path)) file = resolve(root, "app/asistente/index.html");
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end("Not found"); }
});
server.listen(port, "127.0.0.1", () => console.log(`Guest sample live fixture${db ? " (PostgreSQL)" : ""}: ${origin}/app/asistente/`));
async function shutdown() {
  server.close();
  try { if (db) { await db.end({ timeout: 2 }); await admin`drop schema ${admin(schema)} cascade`; await admin.end({ timeout: 2 }); } } catch { /* Best effort. */ }
  process.exit(0);
}
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => { void shutdown(); });
