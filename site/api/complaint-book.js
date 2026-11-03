import postgres from "postgres";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import {
  campusComplaintProvider as provider,
  complaintCode, complaintKey, complaintPage, complaintReceipt, encryptComplaint, validateComplaint,
} from "../src/lib/complaint-book.mjs";

const MAX_BODY_BYTES = 64 * 1024;
let connection;
function database(url) {
  connection ??= postgres(url, { max: 1, prepare: false, connect_timeout: 5, idle_timeout: 15 });
  return connection;
}

async function readForm(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  } finally {
    reader.releaseLock();
  }
}

function errorPage(status, message) {
  // All messages are constant strings controlled by the handler.
  return complaintPage({ title: "No pudimos confirmar el registro", content: `<p>${message}</p>`, status });
}

export async function submitComplaint(request, { env = process.env, fetcher = fetch } = {}) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
  const url = new URL(request.url);
  if (request.headers.get("origin") !== url.origin) return errorPage(403, "Envía la solicitud desde el formulario de Campus.");
  if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return errorPage(415, "Envía la solicitud desde el formulario de Campus.");
  }

  let key;
  try {
    key = complaintKey(env.CAMPUS_COMPLAINTS_ENCRYPTION_KEY);
  } catch {
    return errorPage(503, "El formulario está temporalmente fuera de servicio.");
  }
  if (!env.CAMPUS_COMPLAINTS_DATABASE_URL || !env.CAMPUS_COMPLAINTS_NOTIFY_FROM || !env.RESEND_API_KEY) {
    return errorPage(503, "El formulario está temporalmente fuera de servicio.");
  }

  const form = await readForm(request).catch(() => null);
  const data = form && validateComplaint(form);
  if (!data) return errorPage(400, "Revisa que los datos obligatorios estén completos y que el DNI tenga ocho dígitos.");
  if (form.getAll("website").some(value => value !== "")) return errorPage(400, "Revisa los datos e inténtalo de nuevo.");
  // Vercel sets this header at ingress. Never take the address from the form.
  const ip = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (!ip || !isIP(ip)) return errorPage(503, "El formulario está temporalmente fuera de servicio.");
  const bucket = createHmac("sha256", key).update("complaint-rate:").update(ip).digest("hex");

  let row;
  try {
    const sql = database(env.CAMPUS_COMPLAINTS_DATABASE_URL);
    [row] = await sql`select * from campus_legal.register_complaint(${bucket}, ${encryptComplaint({ provider, data }, key)})`;
  } catch {
    console.error("[complaint-book] registry write failed");
    return errorPage(503, "No pudimos verificar el registro. Comunícate con soporte si el problema continúa.");
  }
  if (!row) return errorPage(429, "Se alcanzó el límite de envíos desde esta conexión. Inténtalo nuevamente en unos minutos.");

  const code = complaintCode(row.id);
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.CAMPUS_COMPLAINTS_NOTIFY_FROM,
        to: [env.CAMPUS_COMPLAINTS_NOTIFY_TO?.trim() || provider.email],
        subject: `Libro de Reclamaciones de Campus: ${code}`,
        text: `Se registró la hoja ${code}. Consulta el registro privado de Campus para atenderla.`,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Notification rejected");
  } catch {
    // The encrypted complaint is already recorded. Keep the receipt available.
    console.error("[complaint-book] internal notification failed", code);
  }
  return complaintReceipt(data, provider, row);
}

export default { fetch: request => submitComplaint(request) };
