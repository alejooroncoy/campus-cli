import { useEffect, useRef, useState } from "react";
import { LOGOS, SheetStrip } from "./CalendarSubscribe";

/** Correos importantes de la UPC en Campito. El alumno acepta el permiso (con el texto
 * vigente que manda el relay) y conecta Outlook en la página de Microsoft. Campus solo
 * guarda el aviso estructurado: nunca asuntos, cuerpos ni adjuntos. */

type Connection = "connected" | "pending_login" | "saving" | "not_connected" | "consent_required" | "unavailable" | "expired" | "failed";
export type OutlookStatus = {
  available: boolean;
  enabled: boolean;
  policy: string;
  permission: string;
  connection: Connection;
};
type Api = (path: string, method?: string, body?: unknown) => Promise<any>;

const POLL_MS = 4000;
const POLL_LIMIT_MS = 5 * 60_000;
const waiting = (c?: Connection) => c === "pending_login" || c === "saving";

/** El estado llega con el de la página (una sola consulta); aquí solo se actualiza
 * después de una acción o mientras se espera a Microsoft. */
function useOutlook(api: Api, status: OutlookStatus | null, onStatus: (next: OutlookStatus) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const polling = useRef<number | null>(null);
  const latest = useRef(status);
  latest.current = status;
  const setStatus = (next: OutlookStatus | ((s: OutlookStatus) => OutlookStatus)) => {
    const value = typeof next === "function" ? (latest.current ? next(latest.current) : null) : next;
    if (value) onStatus(value);
  };
  // Cada acción (conectar, desactivar) y el desmontaje cambian la generación: una
  // consulta de espera que vuelve después ya no pisa el estado ni sigue preguntando.
  const generation = useRef(0);
  const stop = () => {
    generation.current++;
    if (polling.current !== null) window.clearTimeout(polling.current);
    polling.current = null;
  };
  // Mientras el alumno entra a Microsoft en otra pestaña, se vuelve a preguntar.
  const poll = (until = Date.now() + POLL_LIMIT_MS, mine = (stop(), generation.current)) => {
    polling.current = window.setTimeout(async () => {
      polling.current = null;
      try {
        const next: OutlookStatus = await api("/outlook");
        if (mine !== generation.current) return;
        setStatus(next);
        if (waiting(next.connection) && Date.now() < until) poll(until, mine);
      } catch {
        if (mine === generation.current && Date.now() < until) poll(until, mine);
      }
    }, POLL_MS);
  };
  useEffect(() => stop, []);
  useEffect(() => {
    if (waiting(status?.connection) && polling.current === null) poll();
  }, [status?.connection]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos completar esta acción.");
    } finally {
      setBusy(false);
    }
  };
  // La pestaña se abre en el mismo toque: si se abre después de esperar al servidor,
  // el navegador la bloquea. Si Outlook queda conectado sin pasar por Microsoft, se cierra.
  const connect = (accept: boolean) =>
    run(async () => {
      stop();
      const tab = window.open("", "_blank");
      try {
        if (accept && status) setStatus(await api("/outlook", "POST", { consent: true, policy: status.policy }));
        const result = await api("/outlook/connect", "POST", {});
        if (result.loginUrl && tab) {
          tab.opener = null;
          tab.location.href = result.loginUrl;
        } else tab?.close();
        if (result.loginUrl && !tab) window.location.assign(result.loginUrl);
        setStatus((s) => ({ ...s, enabled: true, connection: result.status }));
        if (waiting(result.status)) poll();
      } catch (e) {
        tab?.close();
        throw e;
      }
    });
  const remove = () =>
    run(async () => {
      stop();
      setStatus(await api("/outlook", "DELETE"));
    });
  return { status, busy, error, connect, remove };
}

function Card({ state }: { state: ReturnType<typeof useOutlook> }) {
  const { status, busy, error, connect, remove } = state;
  const [agreed, setAgreed] = useState(false);
  if (!status?.available) return null;
  const on = status.enabled && status.connection === "connected";
  const pending = status.enabled && waiting(status.connection);
  return (
    <section className="campu-cal-sync campu-mail" aria-labelledby="campu-mail-title" aria-busy={busy}>
      <h2 id="campu-mail-title">Correos importantes de la UPC</h2>
      {on ? (
        <>
          <p className="campu-cal-sync-lead">
            Activo. Reviso tu Outlook de la UPC y te aviso cuando la universidad te pida algo: trámites,
            documentos, matrícula, becas, respuestas de tus profesores y biblioteca.
          </p>
          <p className="campu-cal-sync-fine">Lo que ya está en Blackboard no te lo repito.</p>
          <div className="campu-cal-sync-actions">
            <button type="button" className="campu-secondary" disabled={busy} onClick={remove}>
              Desactivar y borrar avisos
            </button>
          </div>
        </>
      ) : status.enabled ? (
        <>
          <p className="campu-cal-sync-lead">
            {pending
              ? "Termina de entrar con tu cuenta de la UPC en la pestaña de Microsoft. Esta tarjeta se actualiza sola."
              : "Falta conectar tu Outlook de la UPC para revisar tus correos."}
          </p>
          <div className="campu-cal-sync-actions">
            <button type="button" disabled={busy} onClick={() => connect(false)}>
              {pending ? "Abrir Microsoft de nuevo" : "Conectar Outlook"}
            </button>
            <button type="button" className="campu-secondary" disabled={busy} onClick={remove}>
              Desactivar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="campu-cal-sync-lead">
            Te aviso cuando la universidad te escriba algo que tengas que hacer, sin que tengas que abrir
            Outlook: trámites, documentos, matrícula, becas, respuestas de tus profesores y biblioteca.
          </p>
          <details className="campu-cal-sync-more">
            <summary>Qué reviso y qué no</summary>
            <p>{status.permission}</p>
          </details>
          <label className="campu-mail-consent">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.currentTarget.checked)} />
            <span>Acepto que Campus revise mis correos de la UPC como se explica arriba.</span>
          </label>
          <div className="campu-cal-sync-actions">
            <button type="button" disabled={busy || !agreed} onClick={() => connect(true)}>
              Activar y conectar Outlook
            </button>
          </div>
          <p className="campu-cal-sync-fine">Entras con tu cuenta de la UPC en la página de Microsoft. Puedes desactivarlo cuando quieras.</p>
        </>
      )}
      {error && (
        <p className="campu-alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** En escritorio, la tarjeta; en celular, una franja que la abre en una hoja inferior. */
export default function OutlookImportant({
  api,
  status,
  onStatus,
  mode,
}: {
  api: Api;
  status: OutlookStatus | null | undefined;
  onStatus: (next: OutlookStatus) => void;
  mode: "card" | "strip";
}) {
  const state = useOutlook(api, status ?? null, onStatus);
  if (!state.status?.available) return null;
  if (mode === "card") return <Card state={state} />;
  const on = state.status.enabled && state.status.connection === "connected";
  return (
    <SheetStrip
      kind="mail"
      logo={LOGOS.outlook}
      text={on ? "Tus correos de la UPC" : "Correos de la UPC"}
      action={on ? "Ajustes" : state.status.enabled ? "Conectar" : "Activar"}
      quiet={on}
      label="Correos importantes de la UPC"
    >
      <Card state={state} />
    </SheetStrip>
  );
}
