import postgres from "postgres";
import { complaintCode, complaintKey, decryptComplaint } from "../src/lib/complaint-book.mjs";

const [code, extra] = process.argv.slice(2);
const url = process.env.CAMPUS_COMPLAINTS_DATABASE_URL;
if (!url || extra || (code && !/^LR-\d{6,19}$/.test(code))) {
  console.error("Configura una conexión privada de lectura. Uso: node scripts/read-complaint-book.mjs [LR-000001]");
  process.exit(1);
}

const sql = postgres(url, { max: 1, connect_timeout: 5 });
try {
  if (!code) {
    const rows = await sql`select id, received_at from campus_legal.complaints order by id desc limit 100`;
    for (const row of rows) console.log(complaintCode(row.id), row.received_at.toISOString());
  } else {
    const key = complaintKey(process.env.CAMPUS_COMPLAINTS_ENCRYPTION_KEY);
    const [row] = await sql`select received_at, encrypted_record from campus_legal.complaints where id = ${code.slice(3)}`;
    if (!row) {
      console.error("No se encontró la hoja solicitada.");
      process.exitCode = 1;
    } else {
      const record = decryptComplaint(row.encrypted_record, key);
      console.log(JSON.stringify({ code, receivedAt: row.received_at, ...record }, null, 2));
    }
  }
} catch {
  console.error("No se pudo leer el registro privado.");
  process.exitCode = 1;
} finally {
  await sql.end();
}
