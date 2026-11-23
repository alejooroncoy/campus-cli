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
/** Con la sesión de Microsoft de Campus el worker entra solo en ~10 s: se pregunta más
 * seguido y, si no termina en este tiempo, se ofrece entrar a mano. */
const SILENT_POLL_MS = 2000;
const SILENT_LIMIT_MS = 45_000;
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
  // Mientras se conecta (solo o con el alumno en Microsoft), se vuelve a preguntar.
  // Si iba solo y no terminó a tiempo, se ofrece entrar a mano con el enlace.
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [silent, setSilent] = useState(false);
  const poll = (
    until = Date.now() + POLL_LIMIT_MS,
    mine = (stop(), generation.current),
    every = POLL_MS,
    giveUp?: number,
  ) => {
    polling.current = window.setTimeout(async () => {
      polling.current = null;
      try {
        const next: OutlookStatus = await api("/outlook");
        if (mine !== generation.current) return;
        setStatus(next);
        if (!waiting(next.connection)) return setSilent(false);
        if (giveUp && Date.now() >= giveUp) {
          setSilent(false);
          return poll(until, mine);
        }
        if (Date.now() < until) poll(until, mine, every, giveUp);
      } catch {
        if (mine === generation.current && Date.now() < until) poll(until, mine, every, giveUp);
      }
    }, every);
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
  // Un solo toque: se acepta el permiso y se conecta. Con la sesión de Microsoft que
  // Campus ya tiene, no se abre nada; solo si hace falta entrar se muestra el botón.
  const connect = (accept: boolean) =>
    run(async () => {
      stop();
      setLoginUrl(null);
      if (accept && status) setStatus(await api("/outlook", "POST", { consent: true, policy: status.policy }));
      const result = await api("/outlook/connect", "POST", {});
      setStatus((s) => ({ ...s, enabled: true, connection: result.status }));
      if (typeof result.loginUrl === "string") setLoginUrl(result.loginUrl);
      if (!waiting(result.status)) return;
      if (result.silent === true) {
        setSilent(true);
        poll(Date.now() + POLL_LIMIT_MS, undefined, SILENT_POLL_MS, Date.now() + SILENT_LIMIT_MS);
      } else poll();
    });
  const remove = () =>
    run(async () => {
      stop();
      setSilent(false);
      setLoginUrl(null);
      setStatus(await api("/outlook", "DELETE"));
    });
  return { status, busy, error, connect, remove, loginUrl, silent };
}

function Card({ state }: { state: ReturnType<typeof useOutlook> }) {
  const { status, busy, error, connect, remove, loginUrl, silent } = state;
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
          <p className="campu-cal-sync-lead" role="status">
            {pending && silent
              ? "Conectando tu Outlook de la UPC con tu cuenta de Campus. Tarda unos segundos."
              : pending && loginUrl
                ? "Falta un paso: entra con tu cuenta de la UPC en Microsoft. Esta tarjeta se actualiza sola."
                : pending
                  ? "Conectando tu Outlook de la UPC. Esta tarjeta se actualiza sola."
                  : "Falta conectar tu Outlook de la UPC para revisar tus correos."}
          </p>
          {!(pending && silent) && (
            <div className="campu-cal-sync-actions">
              {pending && loginUrl ? (
                <a className="campu-mail-login" href={loginUrl} target="_blank" rel="noopener noreferrer">
                  Entrar con Microsoft
                </a>
              ) : (
                <button type="button" disabled={busy} onClick={() => connect(false)}>
                  {pending ? "Volver a intentar" : "Conectar Outlook"}
                </button>
              )}
              <button type="button" className="campu-secondary" disabled={busy} onClick={remove}>
                Desactivar
              </button>
            </div>
          )}
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
          <div className="campu-cal-sync-actions">
            <button type="button" disabled={busy} onClick={() => connect(true)}>
              Aceptar y activar
            </button>
          </div>
          <p className="campu-cal-sync-fine">
            Al aceptar autorizas lo que explica «Qué reviso y qué no». Uso la cuenta de la UPC con la que entras a
            Campus y puedes desactivarlo cuando quieras.
          </p>
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
      action={on ? "Ajustes" : state.status.enabled && waiting(state.status.connection) ? "Conectando" : state.status.enabled ? "Conectar" : "Activar"}
      quiet={on}
      label="Correos importantes de la UPC"
    >
      <Card state={state} />
    </SheetStrip>
  );
}
