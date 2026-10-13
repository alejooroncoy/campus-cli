export const activityLabels: Record<string, string> = {
  academic: "Consultando tu contexto académico…",
  grades: "Consultando tus notas en Mi UPC…",
  connecting: "Conectando con Campus…",
  search: "Buscando profesores…",
  course: "Consultando cursos y profesores…",
  reviews: "Leyendo reseñas…",
  answer: "Preparando respuesta…",
};

const activityDescriptions: Record<string, string> = {
  connecting: "Preparando tu consulta en Campus.",
  academic: "Consultando tu información académica mediante el MCP de Campus.",
  grades: "Consultando notas y pesos de Mi UPC mediante el MCP de Campus.",
  search: "Buscando coincidencias en el catálogo de profesores.",
  course: "Consultando la información de cursos y profesores.",
  reviews: "Consultando las experiencias compartidas por estudiantes.",
  answer: "Organizando la información para responderte.",
};

export function appendActivity(steps: string[], activity: string): string[] {
  if (!Object.hasOwn(activityLabels, activity) || steps.at(-1) === activity) return steps;
  return [...steps, activity].slice(-30);
}

export default function ChatActivity({ steps, busy, interrupted = false }: {
  steps: string[]; busy: boolean; interrupted?: boolean;
}) {
  const current = steps.at(-1) ?? "connecting";
  const label = busy ? activityLabels[current] : interrupted ? "Consulta interrumpida" : "Consulta finalizada";
  return (
    <details className="app-chat-activity" aria-label="Actividad de Campus">
      <summary>
        <span className="app-profes-ai__thinking-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><use href="/assets/lucide.svg#book-open" /></svg>
        </span>
        <span role="status">{label}</span>
        <svg className="app-chat-activity__chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <ol aria-label="Pasos de esta consulta">
        {steps.map((step, index) => (
          <li key={index} aria-current={busy && index === steps.length - 1 ? "step" : undefined}>
            <span>{activityDescriptions[step]}</span>
            {busy && index === steps.length - 1 ? <small>En curso</small> : null}
          </li>
        ))}
      </ol>
    </details>
  );
}
