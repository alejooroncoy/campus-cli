// Pregunta corta por clase: aparece cuando el texto de una clase queda listo, una vez por clase.
// Usa el mismo panel que la encuesta de mejoras; las respuestas llevan client_shell para separar APK y web.
import { useEffect, useRef, useState } from 'react';
import { getCampusSession } from '../scripts/campus-session';
import { mountClassFeedbackSurvey } from '../scripts/plus-survey';

/**
 * `classId`: la clase sobre la que se pregunta (separa lo respondido en este dispositivo).
 * `title`: nombre de la clase, para que el alumno sepa de cuál se trata.
 * `active`: hay texto listo y no se está grabando ni mostrando la encuesta de mejoras.
 */
export default function ClassFeedback({ classId, title, active }: { classId: string; title: string; active: boolean }) {
  const panel = useRef<HTMLElement>(null);
  const survey = useRef<ReturnType<typeof mountClassFeedbackSurvey> | null>(null);
  // Una sola pregunta a la vez: mientras la encuesta de mejoras está a la vista, esta espera.
  const [improvementOpen, setImprovementOpen] = useState(false);
  useEffect(() => {
    const other = document.querySelector<HTMLElement>('[data-classes-survey]');
    if (!other) return;
    const sync = () => setImprovementOpen(!other.hidden);
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(other, { attributes: true, attributeFilter: ['hidden'] });
    return () => observer.disconnect();
  }, []);
  const ready = active && !improvementOpen;
  useEffect(() => {
    if (!panel.current) return;
    survey.current = mountClassFeedbackSurvey(panel.current, classId);
    return () => { survey.current?.dispose(); survey.current = null; };
  }, [classId]);
  useEffect(() => {
    let current = true;
    void getCampusSession().then(session => { if (current) void survey.current?.update(ready ? 'ready' : 'waiting', session); }).catch(() => {});
    return () => { current = false; };
  }, [ready, classId]);
  return <section ref={panel} className="app-panel plus-survey classes-survey classes-feedback" data-class-feedback hidden aria-labelledby={`class-feedback-title-${classId}`}>
    <div className="plus-survey__header"><p className="app-kicker">TU ÚLTIMA CLASE</p><button type="button" className="plus-survey__close" data-survey-close aria-label="Cerrar pregunta">×</button></div>
    <p className="classes-feedback__class">{title}</p>
    <h2 id={`class-feedback-title-${classId}`} data-survey-title />
    <div className="plus-survey__choices" data-survey-choices role="group" aria-labelledby={`class-feedback-title-${classId}`} />
    <form data-survey-comment hidden>
      <label className="app-sr-only" htmlFor={`class-feedback-comment-${classId}`} />
      <textarea id={`class-feedback-comment-${classId}`} rows={3} maxLength={1000} placeholder="Cuéntanos qué pasó (opcional)" />
      <div className="plus-survey__actions"><button className="app-button" type="submit">Enviar comentario</button><button className="app-text-link" type="button" data-survey-skip>Terminar sin comentario</button></div>
    </form>
    <p className="classes-note" data-survey-status role="status" aria-live="polite" />
  </section>;
}
