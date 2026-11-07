import { track } from "../scripts/analytics";
import { useEffect, useRef, useState } from "react";
import {
  getCampusSession,
  type CampusSession,
} from "../scripts/campus-session";
import {
  enablePushDevice,
  removePushDevice,
} from "../scripts/proactive-device";
import "./campu-updates.css";

type Preferences = {
  enabled: boolean;
  email: boolean;
  push: boolean;
  procedures: boolean;
  courses: string[];
  timezone: string;
  categories: string[];
};
type Fact = {
  id: string;
  kind: string;
  course: string;
  title: string;
  dueAt?: string;
  score?: number;
  maxScore?: number;
  weight?: number | null;
  term?: string;
  submitted?: boolean;
  status?: string;
  text?: string;
  source: string;
};
type Source = {
  source: string;
  complete: boolean;
  checkedAt: string;
  errors?: string[];
};
const sourceNames: Record<string, string> = {
  "blackboard:assignments": "Tareas de Blackboard",
  "blackboard:feedback": "Notas y retroalimentación de Blackboard",
  "blackboard:announcements": "Anuncios de Blackboard",
  "blackboard:materials": "Materiales de Blackboard",
  "miupc:grades": "Notas oficiales de Mi UPC",
  "miupc:procedureRequests": "Trámites de Mi UPC",
  "miupc:legacyRequests": "Mis Trámites (Mi UPC)",
};
const gradeStatus: Record<string, string> = {
  not_published: "Sin nota publicada",
  final_not_published: "Promedio final aún no publicado",
  published: "Publicada",
};
type UpcomingItem = {
  courseId: string;
  course: string;
  title: string;
  what: string;
  studentAction: boolean;
  when: { kind: string; text: string };
  from: string | null;
  to: string | null;
  bucket: "this_week" | "next_week" | "later" | "unscheduled";
  inBlackboard: boolean;
  done: boolean;
  next: boolean;
  after: string | null;
};
type Upcoming = {
  term: string;
  week: number;
  from: string;
  to: string;
  items: UpcomingItem[];
  counts: { thisWeek: number; nextWeek: number; notInBlackboard: number };
};
type Context = {
  id: string;
  summary: string;
  preparedAt: string;
  lastCheckedAt?: string;
  lastSuccessfulCheckAt?: string;
  freshness: string;
  preparation: string;
  coverage: {
    complete: boolean;
    documentsComplete: boolean;
    sources?: Source[];
  };
  facts: Fact[];
  claims: { text: string; status: string; evidenceIds: string[] }[];
  evidence: {
    id: string;
    title: string;
    course: string;
    locator: string;
    text: string;
  }[];
  upcoming?: Upcoming | null;
  pending: string[];
  prompt: string;
  nextCursor?: string;
  nextEvidenceCursor?: string;
};
type Notice = {
  id: string;
  title: string;
  createdAt: string;
  read: boolean;
  contextId?: string;
};
const initial: Preferences = {
  enabled: false,
  email: false,
  push: false,
  procedures: false,
  courses: [],
  timezone: "America/Lima",
  categories: ["assignments", "grades", "materials", "announcements"],
};
const labels: Record<string, string> = {
  disabled: "Desactivado",
  preparing: "Preparando tu primera revisión",
  active: "Seguimiento activo",
  partial: "Revisión parcial",
  paused: "En pausa",
  connection_required: "Renueva la conexión con tu universidad",
  access_required: "Revisa tu acceso a Campus Plus",
  deleting: "Eliminando tus preparaciones",
};
const categories = [
  ["assignments", "Entregas y fechas"],
  ["grades", "Notas y retroalimentación"],
  ["materials", "Materiales"],
  ["announcements", "Anuncios"],
];
const timestamp = (v?: string) =>
  v
    ? new Intl.DateTimeFormat("es-PE", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Lima",
      }).format(new Date(v))
    : "Todavía sin revisión completa";
const message = (code: string) =>
  ({
    LOGIN_REQUIRED: "Entra a Campus para ver tus novedades.",
    PROACTIVE_DISABLED:
      "Campu proactivo está en preparación. Lo habilitaremos primero para un grupo piloto.",
    PLAN_REQUIRED:
      "Esta función requiere el acceso MCP incluido en Campus Plus.",
    PILOT_NOT_ENABLED: "Tu cuenta todavía no está incluida en el piloto.",
    CONNECTION_REQUIRED:
      "Conecta o renueva tu Aula Virtual para activar el seguimiento.",
    CONTEXT_NOT_READY:
      "Campu todavía está preparando este resumen. Vuelve después de la próxima revisión.",
    DELETION_PENDING:
      "La eliminación de la memoria está en curso. Podrás activar de nuevo cuando termine.",
  })[code] ??
  "No pudimos completar esta acción. Tu información anterior conserva su fecha. Inténtalo de nuevo.";
async function requestApi(path: string, method = "GET", body?: unknown) {
  const r = await fetch("/api/app/proactive" + path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(25000),
  });
  const data = await r.json();
  if (!r.ok) throw Error(message(data.error));
  return data;
}
const shortDay = (v: string) =>
  new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(v + "T00:00:00Z"))
    .replace(".", "");
/** "22 nov", "9–15 nov" o "30 nov–6 dic": lo mínimo para ubicar la fecha. */
const rangeLabel = (from: string | null, to: string | null) => {
  if (!from || !to) return "Sin fecha";
  if (from === to) return shortDay(from);
  const [a, b] = [shortDay(from), shortDay(to)];
  const [dayA, monthA] = a.split(" "),
    [, monthB] = b.split(" ");
  return monthA === monthB ? `${dayA}–${b}` : `${a}–${b}`;
};
const WEEK = 7 * 86400_000;
const CELLS = 5; // esta semana, la próxima, dos más y "Sig. semanas"
const cellOf = (u: Upcoming, i: UpcomingItem) => {
  if (!i.from) return -1; // sin fecha: no entra en la tira
  // Piso, no redondeo: un domingo sigue siendo de su semana.
  const offset = Math.floor(
    (Date.parse(i.from + "T00:00:00Z") - Date.parse(u.from + "T00:00:00Z")) /
      WEEK,
  );
  return Math.min(Math.max(offset, 0), CELLS - 1);
};
const cellLabel = (u: Upcoming, n: number) =>
  n === 0
    ? "Esta"
    : n === 1
      ? "Próxima"
      : n === CELLS - 1
        ? "Sig. semanas"
        : `Sem ${u.week + n}`;

/** Campu cuenta en una frase lo que viene; los títulos salen del cronograma y
 * se muestran como texto. */
function sentence(items: UpcomingItem[], u: Upcoming) {
  const now = items.filter((i) => cellOf(u, i) === 0);
  const next = items.filter((i) => cellOf(u, i) === 1);
  const first = [...items]
    .filter((i) => i.from)
    .sort((x, y) => x.from!.localeCompare(y.from!))[0];
  const one = (list: UpcomingItem[]) =>
    list.length === 1 ? <b>{list[0].title}</b> : <b>{list.length} cosas</b>;
  return (
    <>
      {now.length ? (
        <>Esta semana te toca {one(now)}.</>
      ) : (
        <>Esta semana va tranquila.</>
      )}{" "}
      {next.length ? (
        <>La próxima, {one(next)}.</>
      ) : now.length || !first ? null : (
        <>
          Lo siguiente es <b>{first.title}</b>.
        </>
      )}
    </>
  );
}

/** Lo que el cronograma de tus cursos programa, aunque Blackboard todavía no lo
 * tenga como tarea. Las fechas las calcula el servidor con el calendario de Mi UPC. */
function UpcomingView({ upcoming: u }: { upcoming: Upcoming }) {
  const items = u.items.filter((i) => i.studentAction && !i.done);
  const counts = Array.from(
    { length: CELLS },
    (_, n) => items.filter((i) => cellOf(u, i) === n).length,
  );
  const undated = items.filter((i) => cellOf(u, i) < 0);
  const [picked, setPicked] = useState<number | null>(null);
  if (!items.length) return null;
  // Si el resumen cambió y la celda elegida quedó vacía, vuelve a la primera con algo.
  const active =
    picked !== null && counts[picked] > 0
      ? picked
      : Math.max(
          counts.findIndex((c) => c > 0),
          0,
        );
  return (
    <section className="campu-card campu-upcoming">
      <div className="campu-says">
        <img
          src="/assets/campu/campu-wave-v2-192.webp"
          width="72"
          height="72"
          alt=""
          aria-hidden="true"
        />
        <p>{sentence(items, u)}</p>
      </div>
      {counts.some(Boolean) && (
        <>
          <div className="campu-weeks" role="tablist" aria-label="Lo que viene">
            {counts.map((count, n) => (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={n === active}
                aria-label={`${cellLabel(u, n)}, ${count} ${count === 1 ? "cosa" : "cosas"}`}
                disabled={!count}
                onClick={() => setPicked(n)}
              >
                <span>{cellLabel(u, n)}</span>
                <span className="campu-pips" aria-hidden="true">
                  {Array.from({ length: Math.min(count, 3) }, (_, k) => (
                    <i key={k} />
                  ))}
                </span>
              </button>
            ))}
          </div>
          <ul className="campu-upcoming-list" role="tabpanel">
            {items
              .filter((i) => cellOf(u, i) === active)
              .map((i, n) => (
                <li key={`${i.courseId}|${i.title}|${n}`}>
                  <div>
                    <strong>{i.title}</strong>
                    <small>
                      {i.course}
                      {!i.inBlackboard && <em>Aún no está en Blackboard</em>}
                    </small>
                  </div>
                  <span className="campu-date">{rangeLabel(i.from, i.to)}</span>
                </li>
              ))}
          </ul>
        </>
      )}
      {!!undated.length && (
        <p className="campu-undated">
          Sin fecha confirmada: {undated.map((i) => i.title).join(", ")}
        </p>
      )}
    </section>
  );
}

function FactView({ fact: f, removed }: { fact: Fact; removed?: boolean }) {
  const miupc = f.source === "miupc:grades";
  return (
    <article className="campu-fact">
      <p className="campu-eyebrow">
        {f.course} ·{" "}
        {removed
          ? "Ya no aparece en la fuente"
          : f.kind === "assignment"
            ? "Publicado en Blackboard"
            : f.kind === "procedure"
              ? "Estado publicado en Mi UPC"
              : f.kind === "grade"
                ? miupc
                  ? `Nota oficial en Mi UPC${f.term ? ` · ${f.term}` : ""}`
                  : "Nota en Blackboard"
                : f.kind === "feedback"
                  ? "Retroalimentación"
                  : f.kind === "announcement"
                    ? "Anuncio"
                    : "Material"}
      </p>
      <h3>{f.title || "Sin título publicado"}</h3>
      {f.dueAt && (
        <p>
          Vence: {timestamp(f.dueAt)}{" "}
          {f.submitted ? "· Con intento enviado" : ""}
        </p>
      )}
      {typeof f.score === "number" && (
        <p>
          Nota:{" "}
          <strong>
            {f.score} / {f.maxScore ?? "máximo no especificado"}
          </strong>
        </p>
      )}
      {typeof f.weight === "number" && <p>Peso: {f.weight}%</p>}
      {f.status && (
        <p>
          Estado: {miupc ? (gradeStatus[f.status] ?? f.status) : f.status}
        </p>
      )}
      {f.text && <p className="campu-preserve">{f.text}</p>}
      {removed && (
        <small>
          Lo vi en dos revisiones completas seguidas sin este registro. Se
          muestra su último valor conocido; confírmalo en la fuente.
        </small>
      )}
      {f.kind === "procedure" && (
        <small>
          «PROCEDE» no confirma entrega. Se revisan las dos bandejas de
          solicitudes.
        </small>
      )}
    </article>
  );
}
const limaDay = (v: string | number | Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(
    new Date(v),
  );
const daysBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400_000,
  );
const clock = (v: string) =>
  new Intl.DateTimeFormat("es-PE", {
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(v));
const GROUPS = ["Hoy", "Esta semana", "Antes"];

/** Lo primero que se ve: una frase, lo próximo y lo nuevo. Todo lo demás está en
 * "Ajustes y detalle". Pocas palabras, una cosa por línea. */
function Home({
  context,
  notices,
  emailOn,
  checkedAt,
  incomplete,
  more,
  onMore,
}: {
  context: Context | null;
  notices: Notice[];
  emailOn: boolean;
  checkedAt?: string;
  incomplete: boolean;
  more: boolean;
  onMore: () => void;
}) {
  const today = limaDay(Date.now());
  const u = context?.upcoming ?? null;
  const pending = u ? u.items.filter((i) => i.studentAction && !i.done) : [];
  const dated = pending
    .filter((i) => i.from)
    .sort((a, b) => a.from!.localeCompare(b.from!));
  const first = dated[0];
  const when = !first
    ? ""
    : first.from! <= today && today <= first.to!
      ? first.from === first.to
        ? "Hoy"
        : "Esta semana"
      : (() => {
          const d = daysBetween(today, first.from!);
          return d === 1 ? "Mañana" : `En ${d} días`;
        })();
  const shown = notices.slice(0, 5);
  const bucket = (n: Notice) => {
    const d = daysBetween(limaDay(n.createdAt), today);
    return d <= 0 ? 0 : d < 7 ? 1 : 2;
  };
  return (
    <section className="campu-home">
      <div className="campu-home-top">
        <img
          src="/assets/campu/campu-wave-v2-192.webp"
          width="64"
          height="64"
          alt=""
          aria-hidden="true"
        />
        <div>
          <h1>{u ? sentence(pending, u) : "Reviso tus cursos por ti."}</h1>
          <p>Última revisión: {timestamp(checkedAt)}</p>
        </div>
      </div>
      {first && (
        <div className="campu-next">
          <span>Lo próximo</span>
          <strong>{first.title}</strong>
          <small>{first.course}</small>
          <em>
            {when} · {rangeLabel(first.from, first.to)}
          </em>
          {dated.length > 1 && (
            <small>
              Después: {dated.slice(1, 4).map((i) => i.title).join(", ")}
            </small>
          )}
        </div>
      )}
      {shown.length ? (
        GROUPS.map((name, g) => {
          const list = shown.filter((n) => bucket(n) === g);
          return (
            !!list.length && (
              <div key={name} className="campu-day">
                <h2>{name}</h2>
                <ul>
                  {list.map((n) => (
                    <li key={n.id}>
                      <a href={"/app/novedades/" + n.id + "/"}>
                        <i className={n.read ? "campu-dot off" : "campu-dot"} />
                        <span>{n.title}</span>
                        <small>
                          {g === 0
                            ? clock(n.createdAt)
                            : shortDay(limaDay(n.createdAt))}
                        </small>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )
          );
        })
      ) : (
        <p className="campu-muted">Todavía no hay novedades.</p>
      )}
      {incomplete && (
        <p className="campu-muted">
          Me faltan fuentes por revisar: esto no confirma que no tengas nada
          pendiente.
        </p>
      )}
      <div className="campu-home-foot">
        <span>{emailOn ? "Te aviso por correo" : "Sin avisos por correo"}</span>
        <button
          type="button"
          className="campu-link"
          aria-expanded={more}
          onClick={onMore}
        >
          {more ? "Ocultar ajustes y detalle" : "Ajustes y detalle ›"}
        </button>
      </div>
    </section>
  );
}
export default function CampuUpdates() {
  const [session, setSession] = useState<CampusSession | null>(null),
    [status, setStatus] = useState<any>(null),
    [prefs, setPrefs] = useState<Preferences>(initial),
    [notices, setNotices] = useState<Notice[]>([]),
    [next, setNext] = useState<string | null>(null),
    [context, setContext] = useState<Context | null>(null),
    [events, setEvents] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [info, setInfo] = useState(""),
    [unsubscribe, setUnsubscribe] = useState<string | null>(null),
    [deleteOpen, setDeleteOpen] = useState(false),
    [more, setMore] = useState(false),
    [nick, setNick] = useState("");
  const generation = useRef(0),
    owner = useRef<string | null>(null),
    // `status` dentro del efecto es el de la primera vista (siempre null): la
    // guarda necesita un ref para saber que ya se cargó.
    loaded = useRef(false),
    // El resumen semanal puede tardar en prepararse: si falla, se reintenta solo
    // /week en el siguiente evento, sin reiniciar la pantalla.
    weekPending = useRef(false),
    // Generación que tiene un /week en vuelo: una lectura de una generación
    // anterior se descarta, así que no debe impedir la de la actual.
    weekLoading = useRef<number | null>(null);
  const api = async (path: string, method = "GET", body?: unknown) => {
    const version = generation.current;
    const value = await requestApi(path, method, body);
    if (version !== generation.current)
      throw Error("La cuenta cambió. Recarga para consultar sus novedades.");
    return value;
  };
  const guarded = async (work: () => Promise<void>) => {
    const version = generation.current;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await work();
    } catch (e) {
      if (version === generation.current)
        setError(
          e instanceof Error ? e.message : "No pudimos completar esta acción.",
        );
    } finally {
      if (version === generation.current) setBusy(false);
    }
  };
  useEffect(() => {
    const token = new URL(location.href).searchParams.get("baja");
    if (token) {
      setUnsubscribe(token);
      return;
    }
    let mounted = true;
    async function loadWeek(version: number) {
      if (weekLoading.current === version) return;
      weekLoading.current = version;
      try {
        const c = await api("/week");
        if (mounted && version === generation.current) {
          setContext(c);
          weekPending.current = false;
        }
      } catch {
        // Aún sin contexto preparado o fallo pasajero: se reintenta después.
        if (version === generation.current) weekPending.current = true;
      } finally {
        if (weekLoading.current === version) weekLoading.current = null;
      }
    }
    async function refresh(value: CampusSession) {
      if (!mounted) return;
      const identity = value.authenticated
        ? (value.analyticsId ?? value.email ?? "authenticated")
        : null;
      setSession(value);
      // La sesión se revalida cada 15 s: si es la misma cuenta y ya cargó, no se
      // vacía la pantalla ni se pierde lo que la persona esté escribiendo.
      if (owner.current === identity && loaded.current) {
        if (weekPending.current) void loadWeek(generation.current);
        return;
      }
      owner.current = identity;
      loaded.current = false;
      weekPending.current = false;
      const version = ++generation.current;
      setStatus(null);
      setContext(null);
      setEvents([]);
      setNotices([]);
      setError("");
      if (!identity) return;
      try {
        const s = await api("/status");
        if (!mounted || version !== generation.current) return;
        setStatus(s);
        setPrefs(s.preferences);
        if (!s.available) {
          loaded.current = true;
          return;
        }
        const n = await api("/notices");
        if (!mounted || version !== generation.current) return;
        setNotices(n.notices);
        setNext(n.nextCursor);
        const id = location.pathname.match(
          /^\/app\/novedades\/([0-9a-f-]{36})\/?$/i,
        )?.[1];
        if (id) {
          const result = await api("/notices/" + id);
          if (!mounted || version !== generation.current) return;
          setEvents(result.events ?? []);
          track("campus_proactive_notice_opened");
          if (result.notice.contextId) {
            const c = await api("/contexts/" + result.notice.contextId);
            if (mounted && version === generation.current) setContext(c);
          }
          await api("/notices/" + id, "POST", {});
        } else if (s.preferences.enabled) {
          await loadWeek(version);
        }
        // Solo al terminar toda la cadena: si algo falló, el siguiente evento de
        // sesión vuelve a intentarlo.
        if (mounted && version === generation.current) loaded.current = true;
      } catch (e) {
        if (mounted && version === generation.current)
          setError(
            e instanceof Error
              ? e.message
              : "No pudimos consultar tus novedades.",
          );
      }
    }
    void getCampusSession()
      .then(refresh)
      .catch(() =>
        setError(
          "No pudimos comprobar tu sesión. Recarga para intentarlo de nuevo.",
        ),
      );
    const updated = (e: Event) =>
      void refresh((e as CustomEvent<CampusSession>).detail);
    window.addEventListener("campus:session-updated", updated);
    return () => {
      mounted = false;
      generation.current++;
      window.removeEventListener("campus:session-updated", updated);
    };
  }, []);
  useEffect(() => {
    setNick(status?.nickname ?? "");
  }, [status?.nickname]);
  async function saveNickname(value: string) {
    const clean = value.trim();
    if (clean && !/^[\p{L}][\p{L}'’ -]{0,29}$/u.test(clean))
      throw Error("Usa solo letras, hasta 30.");
    const result = await api("/nickname", "POST", { nickname: clean });
    setStatus((s: any) => ({ ...s, ...result }));
    setInfo(
      result.nickname
        ? `Listo, te voy a decir ${result.nickname}.`
        : "Listo, vuelvo a usar tu nombre.",
    );
  }
  async function save(value: Preferences) {
    const result = await api("/preferences", "POST", value);
    track("campus_proactive_preferences_saved", {
      proactive_enabled: value.enabled,
      email_enabled: value.email,
      push_enabled: value.push,
    });
    setPrefs(result.preferences);
    setStatus((s: any) => ({ ...s, ...result }));
    setInfo(
      value.enabled
        ? "Preferencias guardadas. Campu revisará tus fuentes y preparará tu resumen."
        : "Seguimiento pausado. Puedes conservar o eliminar lo que ya preparó Campu.",
    );
  }
  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setPrefs((p) => ({ ...p, [key]: value }));
  // Vista simple solo con el seguimiento activo; si hay algo que arreglar, o se
  // abrió un aviso concreto, se ve el detalle completo.
  const simple = Boolean(
    status?.available &&
      prefs.enabled &&
      ["active", "partial"].includes(status.status) &&
      !events.length &&
      !(
        typeof location !== "undefined" &&
        /^\/app\/novedades\/[0-9a-f-]{36}\/?$/i.test(location.pathname)
      ),
  );
  const showDetail = !simple || more;
  return (
    <div className="campu-updates">
      {!simple && (
      <header className="campu-heading">
        <img
          src="/assets/campu/campu-wave-v2-192.webp"
          alt=""
          width="84"
          height="84"
        />
        <div>
          <p className="campu-eyebrow">Campu proactivo · Piloto UPC</p>
          <h1>Tu semana, un paso adelante.</h1>
          <p>
            Me encargo de revisar las novedades para que sepas qué cambió y
            puedas continuar con tu IA.
          </p>
        </div>
      </header>
      )}
      {error && (
        <p role="alert" className="campu-alert">
          {error}
        </p>
      )}
      {info && (
        <p role="status" className="campu-message">
          {info}
        </p>
      )}
      {unsubscribe ? (
        <section className="campu-card">
          <h2>Desactivar correos de Campu</h2>
          <p>Confirma para dejar de recibir estos avisos por correo.</p>
          <button
            disabled={busy}
            onClick={() =>
              void guarded(async () => {
                await api("/unsubscribe", "POST", { token: unsubscribe });
                setUnsubscribe(null);
                history.replaceState({}, "", "/app/novedades/");
                setInfo("Los avisos por correo están desactivados.");
              })
            }
          >
            Desactivar correos
          </button>
        </section>
      ) : (
        <>
          {!session && !error && <p role="status">Comprobando tu cuenta…</p>}
          {session && !session.authenticated && (
            <section className="campu-card">
              <h2>Tus novedades son privadas.</h2>
              <p>Entra con la misma cuenta que usas en el MCP de Campus.</p>
              <a
                className="app-button"
                href={
                  "/api/app/auth/start?return=" +
                  encodeURIComponent(
                    typeof location === "undefined"
                      ? "/app/novedades/"
                      : location.pathname,
                  )
                }
              >
                Entrar a Campus
              </a>
            </section>
          )}
          {status && (
            <>
              {simple && (
                <Home
                  context={context}
                  notices={notices}
                  emailOn={prefs.email}
                  checkedAt={status.lastSuccessAt}
                  incomplete={Boolean(
                    status.coverage && !status.coverage.complete,
                  )}
                  more={more}
                  onMore={() => setMore((v) => !v)}
                />
              )}
              {showDetail && (
              <>
              <section className="campu-card campu-status">
                <div>
                  <h2>{labels[status.status] ?? "Revisando tu conexión"}</h2>
                  <p>
                    Última revisión completa: {timestamp(status.lastSuccessAt)}
                  </p>
                  {status.lastError && <p>{status.lastError}</p>}
                  {status.coverage && !status.coverage.complete && (
                    <p>
                      Hay fuentes pendientes. Esto no confirma que no tengas
                      novedades o entregas.
                    </p>
                  )}
                </div>
                <a href="/app/copilot/">Revisar conexión con mi IA →</a>
              </section>
              {!status.available && (
                <p className="campu-alert">
                  Este piloto requiere Campus Plus, una conexión UPC activa y
                  una cuenta habilitada para participar.
                </p>
              )}
              <div className="campu-columns">
                <section className="campu-card">
                  <h2>Cómo quieres que te avise</h2>
                  <p>
                    Las revisiones se programan a las 8, 12, 16 y 20 h. El
                    resumen semanal se prepara el lunes. Los avisos importantes
                    se agrupan, con un máximo de dos al día además del resumen.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void guarded(() => save(prefs));
                    }}
                  >
                    <fieldset disabled={busy}>
                      <legend>Seguimiento y canales</legend>
                      <label>
                        <input
                          type="checkbox"
                          disabled={!status.available && !prefs.enabled}
                          checked={prefs.enabled}
                          onChange={(e) => update("enabled", e.target.checked)}
                        />
                        Activar Campu proactivo
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={prefs.email}
                          onChange={(e) => update("email", e.target.checked)}
                        />
                        Avisos al correo de mi cuenta
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={prefs.push}
                          onChange={(e) => update("push", e.target.checked)}
                        />
                        Avisos push en mis dispositivos registrados
                      </label>
                    </fieldset>
                    <p className="campu-muted">
                      El resumen prepara el contexto de los cursos elegidos. Las
                      categorías siguientes filtran los avisos de cambios. Los
                      trámites se consultan solo si activas su opción.
                    </p>
                    <fieldset disabled={busy}>
                      <legend>Qué novedades incluir en los avisos</legend>
                      {categories.map(([key, label]) => (
                        <label key={key}>
                          <input
                            type="checkbox"
                            checked={prefs.categories.includes(key)}
                            onChange={(e) =>
                              update(
                                "categories",
                                e.target.checked
                                  ? [...prefs.categories, key]
                                  : prefs.categories.filter((x) => x !== key),
                              )
                            }
                          />
                          {label}
                        </label>
                      ))}
                      <label>
                        <input
                          type="checkbox"
                          checked={prefs.procedures}
                          onChange={(e) =>
                            update("procedures", e.target.checked)
                          }
                        />
                        Cambios en mis solicitudes de trámites de Mi UPC
                      </label>
                    </fieldset>
                    {!!status.courses?.length && (
                      <fieldset disabled={busy}>
                        <legend>Cursos</legend>
                        <label>
                          <input
                            type="checkbox"
                            checked={!prefs.courses.length}
                            onChange={(e) =>
                              update(
                                "courses",
                                e.target.checked
                                  ? []
                                  : status.courses.map((c: any) => c.id),
                              )
                            }
                          />
                          Todos los cursos disponibles
                        </label>
                        {status.courses.map((c: any) => (
                          <label key={c.id}>
                            <input
                              type="checkbox"
                              checked={
                                !prefs.courses.length ||
                                prefs.courses.includes(c.id)
                              }
                              onChange={(e) => {
                                const all = prefs.courses.length
                                  ? prefs.courses
                                  : status.courses.map((c: any) => c.id);
                                const selected = e.target.checked
                                  ? [...all, c.id]
                                  : all.filter((id: string) => id !== c.id);
                                if (!selected.length) {
                                  setInfo(
                                    "Conserva al menos un curso o pausa el seguimiento.",
                                  );
                                  return;
                                }
                                update("courses", [
                                  ...new Set(selected),
                                ] as string[]);
                              }}
                            />
                            {c.name}
                          </label>
                        ))}
                      </fieldset>
                    )}
                    <label>
                      Zona horaria
                      <select
                        value={prefs.timezone}
                        onChange={(e) => update("timezone", e.target.value)}
                      >
                        <option>America/Lima</option>
                        <option>America/Bogota</option>
                        <option>America/Mexico_City</option>
                        <option>Europe/Madrid</option>
                      </select>
                    </label>
                    <p className="campu-muted">
                      Sin avisos entre las 22 y las 8 h de tu zona. Puedes
                      pausar y eliminar tus preparaciones cuando quieras.
                    </p>
                    <button
                      disabled={busy || (!status.available && prefs.enabled)}
                      type="submit"
                    >
                      {busy ? "Guardando…" : "Guardar preferencias"}
                    </button>
                  </form>
                  {status.suggestedNickname !== undefined && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void guarded(() => saveNickname(nick));
                      }}
                    >
                      <fieldset disabled={busy}>
                        <legend>Cómo te digo</legend>
                        <label>
                          Mi apodo
                          <input
                            type="text"
                            maxLength={30}
                            autoComplete="nickname"
                            value={nick}
                            placeholder={status.suggestedNickname ?? "Tu nombre"}
                            onChange={(e) => setNick(e.target.value)}
                          />
                        </label>
                        <p className="campu-muted">
                          Así te saludo en los correos. Si lo dejas vacío uso{" "}
                          {status.suggestedNickname
                            ? status.suggestedNickname
                            : "tu nombre"}
                          . Cambiarlo no afecta tus avisos ni tus preferencias.
                        </p>
                        <button type="submit">Guardar apodo</button>
                      </fieldset>
                    </form>
                  )}
                  <div className="campu-device">
                    <h3>Este dispositivo</h3>
                    <p>
                      El permiso push se pide solo al pulsar este botón. En
                      iPhone o iPad, primero instala Campus en tu pantalla de
                      inicio.
                    </p>
                    <button
                      className="campu-secondary"
                      disabled={
                        busy || !status.available || !status.pushPublicKey
                      }
                      onClick={() =>
                        void guarded(async () => {
                          await enablePushDevice(
                            status.pushPublicKey,
                            session?.analyticsId ?? session?.email ?? "",
                          );
                          setInfo(
                            "Dispositivo registrado. Activa el canal push y guarda tus preferencias para recibir avisos.",
                          );
                        })
                      }
                    >
                      Permitir push aquí
                    </button>
                    <button
                      className="campu-link"
                      disabled={busy}
                      onClick={() =>
                        void guarded(async () => {
                          await removePushDevice();
                          setInfo(
                            "Los avisos push se desactivaron en este dispositivo.",
                          );
                        })
                      }
                    >
                      Desactivar en este dispositivo
                    </button>
                  </div>
                </section>
                <section className="campu-card">
                  <h2>Lo que encontré para ti</h2>
                  {!notices.length && (
                    <p>
                      {prefs.enabled
                        ? "El primer resumen aparecerá después de que Campu revise tus fuentes."
                        : "Activa el seguimiento para que prepare tu primera semana."}
                    </p>
                  )}
                  <ul className="campu-notices">
                    {notices.map((n) => (
                      <li key={n.id}>
                        <a href={"/app/novedades/" + n.id + "/"}>
                          {!n.read && (
                            <span className="campu-dot" aria-label="Sin leer" />
                          )}
                          {n.title}
                          <small>{timestamp(n.createdAt)}</small>
                        </a>
                      </li>
                    ))}
                  </ul>
                  {next && (
                    <button
                      className="campu-secondary"
                      disabled={busy}
                      onClick={() =>
                        void guarded(async () => {
                          const n = await api("/notices?cursor=" + next);
                          setNotices((v) => [...v, ...n.notices]);
                          setNext(n.nextCursor);
                        })
                      }
                    >
                      Ver más avisos
                    </button>
                  )}
                  <p className="campu-muted">
                    La fecha del aviso indica cuándo detecté el cambio. No
                    prueba cuándo lo publicó el profesor.
                  </p>
                  <button
                    className="campu-link"
                    disabled={busy}
                    onClick={() =>
                      void guarded(async () => {
                        setContext(await api("/week"));
                        setEvents([]);
                      })
                    }
                  >
                    Ver mi resumen de esta semana
                  </button>
                </section>
              </div>
              {!!events.length && (
                <section className="campu-card">
                  <h2>Cambios de este aviso</h2>
                  {events.map((e) => (
                    <div key={e.id}>
                      <FactView
                        fact={e.fact}
                        removed={e.meaning === "removed"}
                      />
                      {e.meaning === "grade_published" && (
                        <p>Antes no tenía nota registrada.</p>
                      )}
                      {typeof e.before?.weight === "number" &&
                        e.before.weight !== e.fact.weight && (
                          <p>Peso anterior registrado: {e.before.weight}%</p>
                        )}
                      {typeof e.before?.score === "number" && (
                        <p>
                          Nota anterior registrada: {e.before.score} /{" "}
                          {e.before.maxScore ?? "máximo no especificado"}
                        </p>
                      )}
                      {e.before?.dueAt && e.before.dueAt !== e.fact.dueAt && (
                        <p>
                          Vencimiento anterior registrado:{" "}
                          {timestamp(e.before.dueAt)}
                        </p>
                      )}
                    </div>
                  ))}
                </section>
              )}
              {context?.upcoming && (
                <UpcomingView upcoming={context.upcoming} />
              )}
              {context && (
                <section className="campu-card campu-context">
                  <p className="campu-eyebrow">
                    Contexto preparado · {timestamp(context.preparedAt)}
                  </p>
                  <h2>Esto es lo que pude revisar.</h2>
                  <p>{context.summary}</p>
                  <p
                    className={
                      context.freshness === "stale"
                        ? "campu-alert"
                        : "campu-muted"
                    }
                  >
                    Revisión de fuentes:{" "}
                    {timestamp(
                      context.lastCheckedAt ?? context.lastSuccessfulCheckAt,
                    )}
                    .{" "}
                    {context.freshness === "stale"
                      ? "Este contexto requiere una nueva verificación."
                      : "Comprueba las fechas y estados vigentes antes de tomar decisiones."}
                  </p>
                  {(!context.coverage.complete ||
                    !context.coverage.documentsComplete) && (
                    <p>
                      La cobertura es parcial. Los materiales pendientes pueden
                      contener otros requisitos.
                    </p>
                  )}
                  {!!context.coverage.sources?.length && (
                    <ul className="campu-muted">
                      {context.coverage.sources.map((s) => (
                        <li key={s.source}>
                          {sourceNames[s.source] ?? s.source}:{" "}
                          {s.complete
                            ? `revisado ${timestamp(s.checkedAt)}`
                            : s.errors?.includes("reconnect_required")
                              ? "necesita que renueves la conexión"
                              : "no se pudo comprobar en la última revisión; se conserva el último dato válido, si existía"}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="campu-handoff">
                    <h3>Continúa con tu IA</h3>
                    <p>
                      Conecta el MCP de Campus y pega este pedido. Tu IA
                      recuperará las fuentes de tu cuenta.
                    </p>
                    <textarea
                      readOnly
                      aria-label="Pedido preparado para mi IA"
                      value={context.prompt}
                    />
                    <button
                      disabled={busy}
                      onClick={() =>
                        void guarded(async () => {
                          await navigator.clipboard.writeText(context.prompt);
                          track("campus_proactive_context_copied");
                          setInfo(
                            "Pedido copiado. Pégalo en tu IA con Campus conectado.",
                          );
                        })
                      }
                    >
                      Copiar pedido preparado
                    </button>
                    <a href="/app/copilot/">Conectar Campus a mi IA →</a>
                  </div>
                  {!!context.claims.length && (
                    <div>
                      <h3>Lo programado en las fuentes</h3>
                      {context.claims.map((claim, i) => (
                        <article key={i} className="campu-fact">
                          <strong>
                            {claim.status === "scheduled"
                              ? "Programado oficialmente"
                              : "Alcance o fecha por confirmar"}
                          </strong>
                          <p>{claim.text}</p>
                          <small>
                            Fuentes:{" "}
                            {claim.evidenceIds
                              .map(
                                (id) =>
                                  context.evidence.find((e) => e.id === id)
                                    ?.title ?? "Evidencia pendiente de cargar",
                              )
                              .join(" · ")}
                          </small>
                        </article>
                      ))}
                    </div>
                  )}
                  <h3>Publicaciones y estados revisados</h3>
                  {context.facts.map((f) => (
                    <FactView key={f.id} fact={f} />
                  ))}
                  {context.nextCursor && (
                    <button
                      className="campu-secondary"
                      disabled={busy}
                      onClick={() =>
                        void guarded(async () => {
                          const c = await api(
                            "/contexts/" +
                              context.id +
                              "?cursor=" +
                              context.nextCursor,
                          );
                          setContext((old) =>
                            old
                              ? {
                                  ...old,
                                  facts: [...old.facts, ...c.facts],
                                  nextCursor: c.nextCursor,
                                }
                              : old,
                          );
                        })
                      }
                    >
                      Ver más publicaciones
                    </button>
                  )}
                  <h3>Detalles que faltan por confirmar</h3>
                  {context.pending.length ? (
                    <ul>
                      {context.pending.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      Sin observaciones adicionales en las fuentes leídas. Esto
                      no certifica que el profesor haya publicado todas las
                      indicaciones.
                    </p>
                  )}
                  <details>
                    <summary>Ver evidencia y localizadores</summary>
                    {context.evidence.map((e) => (
                      <article key={e.id} className="campu-fact">
                        <h4>
                          {e.course} · {e.title}
                        </h4>
                        <small>{e.locator}</small>
                        <p className="campu-preserve">{e.text}</p>
                      </article>
                    ))}
                    {context.nextEvidenceCursor && (
                      <button
                        className="campu-secondary"
                        disabled={busy}
                        onClick={() =>
                          void guarded(async () => {
                            const c = await api(
                              "/contexts/" +
                                context.id +
                                "?evidenceCursor=" +
                                context.nextEvidenceCursor,
                            );
                            setContext((old) =>
                              old
                                ? {
                                    ...old,
                                    evidence: [...old.evidence, ...c.evidence],
                                    nextEvidenceCursor: c.nextEvidenceCursor,
                                  }
                                : old,
                            );
                          })
                        }
                      >
                        Cargar más evidencia
                      </button>
                    )}
                  </details>
                </section>
              )}
              <section className="campu-card campu-privacy">
                <h2>Tú controlas lo que preparo.</h2>
                <p>
                  Campu revisa tus fuentes autorizadas y prepara avisos y
                  contexto. El contenido preparado se procesa con Luna y
                  TypeSafe para preparar y verificar indicaciones, y con
                  AtomicMemory para recuperar preparaciones. Se conserva hasta
                  90 días. Tu IA lo recibe cuando lo consultas con el MCP.
                </p>
                <p>
                  Antes de enviar una entrega o realizar un trámite, tú decides
                  el siguiente paso.
                </p>
                {!deleteOpen ? (
                  <button
                    className="campu-link"
                    onClick={() => setDeleteOpen(true)}
                  >
                    Eliminar mis preparaciones y pausar
                  </button>
                ) : (
                  <div>
                    <p>
                      Se borrarán el historial, el contexto y los dispositivos
                      de Campu proactivo. La eliminación de memoria externa
                      puede quedar pendiente hasta que el proveedor responda.
                    </p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void guarded(async () => {
                          await removePushDevice();
                          const result = await api("/data", "DELETE", {});
                          track("campus_proactive_deleted");
                          setPrefs(initial);
                          setContext(null);
                          setNotices([]);
                          setEvents([]);
                          setStatus((s: any) => ({
                            ...s,
                            status: result.status,
                          }));
                          setDeleteOpen(false);
                          setInfo(
                            result.status === "deleting"
                              ? "Preparaciones eliminadas en Campus. La eliminación de memoria externa está en curso."
                              : "Tus preparaciones se eliminaron y el seguimiento quedó desactivado.",
                          );
                        })
                      }
                    >
                      Confirmar eliminación
                    </button>
                    <button
                      className="campu-link"
                      onClick={() => setDeleteOpen(false)}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </section>
              </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
