import { useRef, useState, type ReactNode } from "react";
import { track } from "../scripts/analytics";

/** Tu calendario en el calendario que ya usas: un enlace privado (.ics) que se agrega
 * una vez en Google Calendar, Outlook o el iPhone y se actualiza solo. Campus no pide
 * permisos de Google ni de Microsoft: la app del calendario lee el enlace. */

const NAME = "Campus · Tu calendario";
type TargetId = "google" | "outlook" | "apple";
export const calendarTargets = (url: string) => {
  const webcal = url.replace(/^https?:/, "webcal:");
  return [
    {
      id: "google" as TargetId,
      label: "Google Calendar",
      // Con webcal:// Google pide http://, recibe una redirección a https y nombró el
      // calendario con la URL en vez de X-WR-CALNAME (2026-11-20). Con https:// va directo.
      href: "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(url),
    },
    {
      // La cuenta de la UPC es de Microsoft 365.
      id: "outlook" as TargetId,
      label: "Outlook",
      href:
        "https://outlook.office.com/calendar/0/addfromweb?url=" +
        encodeURIComponent(url) +
        "&name=" +
        encodeURIComponent(NAME),
    },
    { id: "apple" as TargetId, label: "iPhone o Mac", href: webcal },
  ];
};

// Logos de Google Calendar y Apple: Simple Icons (CC0). Outlook no está ahí: su "O" azul.
// El color va en cada forma: app-dashboard.css deja todo svg sin relleno y con trazo.
export const LOGOS: Record<TargetId | "copy", ReactNode> = {
  google: (
    <svg viewBox="0 0 24 24">
      <path fill="#1a73e8" d="M18.316 5.684H24v12.632h-5.684V5.684zM5.684 24h12.632v-5.684H5.684V24zM18.316 5.684V0H1.895A1.894 1.894 0 0 0 0 1.895v16.421h5.684V5.684h12.632zm-7.207 6.25v-.065c.272-.144.5-.349.687-.617s.279-.595.279-.982c0-.379-.099-.72-.3-1.025a2.05 2.05 0 0 0-.832-.714 2.703 2.703 0 0 0-1.197-.257c-.6 0-1.094.156-1.481.467-.386.311-.65.671-.793 1.078l1.085.452c.086-.249.224-.461.413-.633.189-.172.445-.257.767-.257.33 0 .602.088.816.264a.86.86 0 0 1 .322.703c0 .33-.12.589-.36.778-.24.19-.535.284-.886.284h-.567v1.085h.633c.407 0 .748.109 1.02.327.272.218.407.499.407.843 0 .336-.129.614-.387.832s-.565.327-.924.327c-.351 0-.651-.103-.897-.311-.248-.208-.422-.502-.521-.881l-1.096.452c.178.616.505 1.082.977 1.401.472.319.984.478 1.538.477a2.84 2.84 0 0 0 1.293-.291c.382-.193.684-.458.902-.794.218-.336.327-.72.327-1.149 0-.429-.115-.797-.344-1.105a2.067 2.067 0 0 0-.881-.689zm2.093-1.931l.602.913L15 10.045v5.744h1.187V8.446h-.827l-2.158 1.557zM22.105 0h-3.289v5.184H24V1.895A1.894 1.894 0 0 0 22.105 0zm-3.289 23.5l4.684-4.684h-4.684V23.5zM0 22.105C0 23.152.848 24 1.895 24h3.289v-5.184H0v3.289z" />
    </svg>
  ),
  outlook: (
    <svg viewBox="0 0 24 24">
      <rect width="24" height="24" rx="5" fill="#0a64c2" />
      <ellipse cx="12" cy="12" rx="5.2" ry="6.4" fill="none" stroke="#fff" strokeWidth="2.6" />
    </svg>
  ),
  apple: (
    <svg viewBox="0 0 24 24">
      <path fill="#111" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24">
      <g fill="none" stroke="#087082" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13.5a4.5 4.5 0 0 0 6.4.4l2.6-2.6a4.5 4.5 0 0 0-6.4-6.4l-1.4 1.4" />
        <path d="M14 10.5a4.5 4.5 0 0 0-6.4-.4L5 12.7a4.5 4.5 0 0 0 6.4 6.4l1.4-1.4" />
      </g>
    </svg>
  ),
};

const TILES = [
  { id: "google", label: "Google Calendar" },
  { id: "outlook", label: "Outlook" },
  { id: "apple", label: "iPhone o Mac" },
  { id: "copy", label: "Copiar enlace" },
] as const;
const COPIED ="Enlace copiado. Pégalo en tu calendario como «Desde URL» o «Suscribirse».";
const failure = (e: unknown) => (e instanceof Error ? e.message : "No pudimos completar esta acción.");

/** En celular, una franja como la de WhatsApp. Al tocarla, su tarjeta se abre en una
 * hoja inferior. La usan el calendario y los correos importantes. */
export function SheetStrip({
  kind,
  logo,
  text,
  action,
  quiet,
  label,
  children,
}: {
  kind: "calendar" | "mail";
  logo: ReactNode;
  text: string;
  action: string;
  quiet: boolean;
  label: string;
  children: ReactNode;
}) {
  const sheet = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        className="campu-cal-strip"
        data-strip={kind}
        data-state={quiet ? "on" : "off"}
        aria-haspopup="dialog"
        onClick={() => sheet.current?.showModal()}
      >
        <span className="campu-cal-strip-logo" aria-hidden="true">
          {logo}
        </span>
        <span className="campu-cal-strip-text">{text}</span>
        <span className="campu-cal-strip-action">{action}</span>
        <span className="campu-cal-strip-chev" aria-hidden="true" />
      </button>
      <dialog
        ref={sheet}
        className="campu-cal-sheet"
        data-sheet={kind}
        aria-label={label}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      >
        <div className="campu-cal-sheet-bar">
          <span className="campu-cal-sheet-grip" aria-hidden="true" />
          <button
            type="button"
            className="campu-cal-sheet-close"
            aria-label="Cerrar"
            onClick={() => sheet.current?.close()}
          >
            ×
          </button>
        </div>
        <div className="campu-cal-sheet-body">{children}</div>
      </dialog>
    </>
  );
}

/** La franja del calendario, justo debajo de la de WhatsApp. */
export function CalendarStrip({ connected, children }: { connected: boolean; children: ReactNode }) {
  return (
    <SheetStrip
      kind="calendar"
      logo={LOGOS.google}
      text={connected ? "Tus entregas están en tu calendario" : "Tus entregas en tu calendario"}
      action={connected ? "Ajustes" : "Agregar"}
      quiet={connected}
      label="Tus entregas en tu calendario"
    >
      {children}
    </SheetStrip>
  );
}

export default function CalendarSubscribe({
  url,
  connect,
  remove,
}: {
  url: string | null;
  /** Crea el enlace (o uno nuevo con reset) y lo devuelve. */
  connect: (reset?: boolean) => Promise<string>;
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
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  };
  // Sin enlace, el primer toque lo crea y sigue al calendario elegido. La pestaña de
  // Google u Outlook se abre antes de esperar al servidor: después, el navegador la bloquea.
  const first = async (id: TargetId | "copy", label: string) => {
    const tab = id === "google" || id === "outlook" ? window.open("", "_blank") : null;
    setBusy(true);
    setError("");
    setNote("");
    let link: string;
    try {
      link = await connect();
      track("campus_calendar_feed_created");
    } catch (e) {
      tab?.close();
      setError(failure(e));
      return;
    } finally {
      setBusy(false);
    }
    track("campus_calendar_feed_opened", { target: id });
    if (id === "copy") {
      await navigator.clipboard.writeText(link).then(
        () => setNote(COPIED),
        () => setNote("Tu enlace está listo. Toca «Copiar enlace» otra vez."),
      );
      return;
    }
    const href = calendarTargets(link).find((t) => t.id === id)!.href;
    if (id === "apple") location.href = href;
    else if (tab) {
      tab.opener = null;
      tab.location.href = href;
    } else setNote(`Tu enlace está listo. Toca ${label} otra vez.`);
  };
  const hrefs: Partial<Record<TargetId, string>> = url
    ? Object.fromEntries(calendarTargets(url).map((t) => [t.id, t.href]))
    : {};
  return (
    <section className="campu-cal-sync" aria-labelledby="campu-cal-sync-title" aria-busy={busy}>
      <h2 id="campu-cal-sync-title">Tus entregas, en tu calendario</h2>
      <p className="campu-cal-sync-lead">
        Aparecen solas junto a tu trabajo y se actualizan varias veces al día.
      </p>
      <ul className="campu-cal-sync-targets">
        {TILES.map((t) => {
          const body = (
            <>
              <span className="campu-cal-sync-logo" aria-hidden="true">
                {LOGOS[t.id]}
              </span>
              {t.label}
            </>
          );
          return (
            <li key={t.id}>
              {!url ? (
                <button
                  type="button"
                  className="campu-cal-sync-target"
                  disabled={busy}
                  onClick={() => first(t.id, t.label)}
                >
                  {body}
                </button>
              ) : t.id === "copy" ? (
                <button
                  type="button"
                  className="campu-cal-sync-target"
                  onClick={() =>
                    run(async () => {
                      await navigator.clipboard.writeText(url);
                      track("campus_calendar_feed_opened", { target: "copy" });
                    }, COPIED)
                  }
                >
                  {body}
                </button>
              ) : (
                <a
                  className="campu-cal-sync-target"
                  href={hrefs[t.id]}
                  target={t.id === "apple" ? undefined : "_blank"}
                  rel="noopener noreferrer"
                  onClick={() => track("campus_calendar_feed_opened", { target: t.id })}
                >
                  {body}
                </a>
              )}
            </li>
          );
        })}
      </ul>
      {busy && !url && (
        <p className="campu-cal-sync-fine" role="status">
          Preparando tu enlace…
        </p>
      )}
      {url && (
        <>
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
