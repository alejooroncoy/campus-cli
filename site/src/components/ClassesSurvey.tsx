// Encuesta de mejoras de Mis clases. Usa el mismo panel y el mismo contrato de privacidad que la encuesta de Plus.
import { useEffect, useRef } from 'react';
import { getCampusSession } from '../scripts/campus-session';
import { mountClassesSurvey } from '../scripts/plus-survey';

/**
 * `hasReadyClass`: hay una clase con el texto listo. Queda fijo una vez visto, porque al refrescar la lista
 * los estados del servidor desaparecen un instante y eso cerraría la encuesta a medio comentario.
 * `recording`: se está grabando o guardando; ahí la encuesta se oculta.
 */
export default function ClassesSurvey({ hasReadyClass, recording }: { hasReadyClass: boolean; recording: boolean }) {
  const panel = useRef<HTMLElement>(null);
  const seenReady = useRef(false);
  if (hasReadyClass) seenReady.current = true;
  const ready = seenReady.current && !recording;
  const survey = useRef<ReturnType<typeof mountClassesSurvey> | null>(null);
  useEffect(() => {
    if (!panel.current) return;
    survey.current = mountClassesSurvey(panel.current);
    return () => { survey.current?.dispose(); survey.current = null; };
  }, []);
  useEffect(() => {
    let current = true;
    void getCampusSession().then(session => { if (current) void survey.current?.update(ready ? 'ready' : 'waiting', session); }).catch(() => {});
    return () => { current = false; };
  }, [ready]);
  return <section ref={panel} className="app-panel plus-survey classes-survey" data-classes-survey hidden aria-labelledby="classes-survey-title">
    <div className="plus-survey__header"><p className="app-kicker">TE ESCUCHAMOS</p><button type="button" className="plus-survey__close" data-survey-close aria-label="Cerrar encuesta">×</button></div>
    <h2 id="classes-survey-title" data-survey-title />
    <p className="classes-note">Responder es opcional. Con tu respuesta decidimos qué mejorar primero.</p>
    <div className="plus-survey__choices" data-survey-choices role="group" aria-labelledby="classes-survey-title" />
    <form data-survey-comment hidden>
      <label className="app-sr-only" htmlFor="classes-survey-comment" />
      <textarea id="classes-survey-comment" rows={3} maxLength={1000} placeholder="Escribe un comentario (opcional)" />
      <div className="plus-survey__actions"><button className="app-button" type="submit">Enviar comentario</button><button className="app-text-link" type="button" data-survey-skip>Terminar sin comentario</button></div>
    </form>
    <p className="classes-note" data-survey-status role="status" aria-live="polite" />
  </section>;
}
