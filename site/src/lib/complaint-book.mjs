import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const campusComplaintProvider = Object.freeze({
  name: "Alejandro Daniel Oroncoy Almeyda",
  ruc: "10731724429",
  address: "Lima, Perú",
  email: "info@campuscli.com",
});

export function complaintKey(value) {
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) throw new Error("Missing complaint encryption key");
  return Buffer.from(value, "hex");
}

export function encryptComplaint(record, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(record), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptComplaint(encoded, key) {
  const buffer = Buffer.from(encoded, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString("utf8"));
}

export function complaintCode(id) {
  return `LR-${String(id).padStart(6, "0")}`;
}

export function validateComplaint(form) {
  const fields = {
    kind: [1, 7], name: [2, 160], documentType: [1, 10], documentNumber: [4, 32],
    address: [4, 240], email: [3, 160], phone: [0, 32], minor: [0, 3], representative: [0, 160],
    purchaseType: [1, 8], purchase: [3, 500], amount: [0, 9], detail: [10, 3000], request: [5, 2000],
  };
  const data = {};
  for (const [key, [min, max]] of Object.entries(fields)) {
    const values = form.getAll(key);
    const value = (values[0] ?? "").trim();
    if (values.length > 1 || value.length < min || value.length > max || value.includes("\0")) return null;
    data[key] = value;
  }
  if (!["reclamo", "queja"].includes(data.kind)
    || !["DNI", "CE", "Pasaporte"].includes(data.documentType)
    || (data.documentType === "DNI" && !/^\d{8}$/.test(data.documentNumber))
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
    || !["", "yes"].includes(data.minor)
    || (data.minor && data.representative.length < 2)
    || !["Producto", "Servicio"].includes(data.purchaseType)
    || (data.amount && !/^\d{1,6}(?:\.\d{1,2})?$/.test(data.amount))) return null;
  if (!data.minor) data.representative = "";
  return data;
}

const escape = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

export function complaintPage({ title, content, status, printable = false }) {
  return new Response(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${escape(title)} | Campus</title>
<link rel="stylesheet" href="/styles.min.css">
<style>
  dl { display:grid; grid-template-columns:minmax(8rem,1fr) 2fr; gap:10px 16px; }
  dt { font-weight:700; }
  dd { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
  @media(max-width:480px) { dl { grid-template-columns:1fr; } dd { margin-bottom:10px; } }
  @media print { .actions { display:none; } .article { max-width:none; padding:0; } }
</style>
${printable ? '<script src="/complaint-receipt.js" defer></script>' : ""}</head>
<body><main class="article"><p class="eyebrow">Campus · Libro de Reclamaciones</p>
<h1>${escape(title)}</h1>${content}
<div class="actions">${printable ? '<button class="button" type="button" id="print-receipt" hidden>Imprimir o guardar copia</button><noscript><p>Usa la opción Imprimir de tu navegador para guardar una copia.</p></noscript>' : ""}
<p><a class="prose-link" href="/reclamos/">Volver al Libro de Reclamaciones</a></p></div>
</main></body></html>`, { status, headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  } });
}

export function complaintReceipt(data, provider, { id, received_at: receivedAt }) {
  const date = new Intl.DateTimeFormat("es-PE", {
    dateStyle: "long", timeStyle: "short", timeZone: "America/Lima",
  }).format(new Date(receivedAt));
  const amount = data.amount === "" ? "No indicado" : `S/ ${Number(data.amount).toFixed(2)}`;
  const rows = [
    ["Número de hoja", complaintCode(id)], ["Fecha de recepción", date], ["Tipo", data.kind === "reclamo" ? "Reclamo" : "Queja"],
    ["Proveedor", `Campus · ${provider.name} · RUC ${provider.ruc}\n${provider.address}\n${provider.email}`],
    ["Consumidor", data.name], ["Documento", `${data.documentType} ${data.documentNumber}`], ["Domicilio", data.address],
    ["Correo electrónico", data.email], ["Teléfono", data.phone || "No indicado"],
    ...(data.minor ? [["Representante", data.representative]] : []),
    ["Producto o servicio", `${data.purchaseType}: ${data.purchase}`], ["Monto reclamado", amount],
    ["Detalle", data.detail], ["Pedido", data.request], ["Acciones del proveedor", "Pendiente de atención"],
  ];
  return complaintPage({
    title: "Hoja de Reclamación registrada",
    status: 201,
    printable: true,
    content: `<p>Guarda esta copia. Campus te responderá por correo en un máximo de 15 días hábiles.</p><dl>${rows.map(([label, value]) => `<dt>${label}</dt><dd>${escape(value)}</dd>`).join("")}</dl>`,
  });
}
