import { useState } from "react";
import { track } from "../scripts/analytics";

/** Tu calendario en el calendario que ya usas: un enlace privado (.ics) que se agrega
 * una vez en Google Calendar, Outlook o el iPhone y se actualiza solo. Campus no pide
 * permisos de Google ni de Microsoft: la app del calendario lee el enlace. */

const NAME = "Campus · Tu calendario";
export const calendarTargets = (url: string) => {
  const webcal = url.replace(/^https?:/, "webcal:");
  return [
    {
      id: "google",
      label: "Google Calendar",
      href: "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(webcal),
    },
    {
      // La cuenta de la UPC es de Microsoft 365.
      id: "outlook",
      label: "Outlook",
      href:
        "https://outlook.office.com/calendar/0/addfromweb?url=" +
        encodeURIComponent(url) +
        "&name=" +
        encodeURIComponent(NAME),
    },
    { id: "apple", label: "iPhone o Mac", href: webcal },
  ];
};

export default function CalendarSubscribe({
  url,
  connect,
  remove,
}: {
  url: string | null;
  connect: (reset?: boolean) => Promise<void>;
  remove: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false);
  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    setError("");
    setNote("");
    try {
      await work();
      setNote(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos completar esta acción.");
    } finally {
      setBusy(false);
    }
  };
  const targets = url ? calendarTargets(url) : [];
  return (
    <section className="campu-cal-sync" aria-labelledby="campu-cal-sync-title">
      <div className="campu-cal-sync-head">
        <span className="campu-cal-sync-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
            <path d="M3.5 10h17M8 3v4M16 3v4M9 14.5l2 2 4-4" />
          </svg>
        </span>
        <div>
          <h2 id="campu-cal-sync-title">Tus entregas en Google Calendar u Outlook</h2>
          <p>
            Aparecen solas en el calendario que ya usas, junto a tu trabajo, y se actualizan varias
            veces al día.
          </p>
        </div>
      </div>
      {!url ? (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await connect();
              track("campus_calendar_feed_created");
            }, "")
          }
        >
          {busy ? "Preparando tu enlace…" : "Conectar mi calendario"}
        </button>
      ) : (
        <>
          <p className="campu-cal-sync-pick">Elige dónde verlo:</p>
          <ul className="campu-cal-sync-targets">
            {targets.map((t) => (
              <li key={t.id}>
                <a
                  className="campu-cal-sync-target"
                  href={t.href}
                  target={t.id === "apple" ? undefined : "_blank"}
                  rel="noopener noreferrer"
                  onClick={() => track("campus_calendar_feed_opened", { target: t.id })}
                >
                  {t.label}
                </a>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="campu-cal-sync-target"
                onClick={() =>
                  run(async () => {
                    await navigator.clipboard.writeText(url);
                    track("campus_calendar_feed_opened", { target: "copy" });
                  }, "Enlace copiado. Pégalo en tu calendario como «Desde URL» o «Suscribirse».")
                }
              >
                Copiar enlace
              </button>
            </li>
          </ul>
          <p className="campu-cal-sync-fine">
            Google y Outlook tardan unas horas en mostrar cada cambio. Lo urgente te llega por
            WhatsApp o correo.
          </p>
          <details className="campu-cal-sync-more" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
            <summary>Tu enlace es privado</summary>
            <p>
              Quien lo tenga puede ver tus entregas. Si lo compartiste por error, cámbialo: el anterior
              deja de funcionar y tendrás que agregar el nuevo.
            </p>
            <div className="campu-cal-sync-actions">
              <button
                type="button"
                className="campu-secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await connect(true);
                    track("campus_calendar_feed_reset");
                  }, "Listo, tu enlace es nuevo. Agrégalo otra vez y borra el anterior «Campus · Tu calendario» de tu calendario.")
                }
              >
                Cambiar enlace
              </button>
              <button
                type="button"
                className="campu-secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await remove();
                    track("campus_calendar_feed_removed");
                  }, "Quitado. Borra también «Campus · Tu calendario» de tu app de calendario.")
                }
              >
                Quitar
              </button>
            </div>
          </details>
        </>
      )}
      {note && (
        <p className="campu-cal-sync-note" role="status">
          {note}
        </p>
      )}
      {error && (
        <p className="campu-alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
