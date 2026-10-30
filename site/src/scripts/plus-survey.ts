import { canAnswerPlusSurvey, getPlusSurvey, track } from './analytics.ts';
import { PLUS_SURVEY_ID } from './plus-survey-contract.ts';
import type { PlusSurvey } from './plus-survey-contract.ts';
import type { CampusSession } from './campus-session.ts';

export function mountPlusSurvey(root: HTMLElement) {
  const panel = root.querySelector<HTMLElement>('[data-plus-survey]')!;
  const title = panel.querySelector<HTMLElement>('[data-survey-title]')!;
  const choices = panel.querySelector<HTMLElement>('[data-survey-choices]')!;
  const form = panel.querySelector<HTMLFormElement>('[data-survey-comment]')!;
  const comment = form.querySelector<HTMLTextAreaElement>('textarea')!;
  const output = panel.querySelector<HTMLElement>('[data-survey-status]')!;
  const close = panel.querySelector<HTMLButtonElement>('[data-survey-close]')!;
  let disposed = false, eligible = false, loading = false, shown = false, answered = false, finished = false;
  let owner = '', storageKey = '', survey: PlusSurvey | undefined, submission = '';
  let visibleTracked = false;
  const visibility = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) markShown(); }, { threshold: 0.25 });
  const answers: Record<string, string> = {};
  const context = () => ({ $survey_id: survey!.id, $survey_iteration: survey!.current_iteration ?? null });
  const remember = () => { try { localStorage.setItem(storageKey, 'done'); } catch { /* Remote targeting also remembers. */ } };
  function markShown() {
    if (visibleTracked || !eligible || disposed || !survey || !canAnswerPlusSurvey(owner)) return;
    visibleTracked = true; track('survey shown', context()); visibility.disconnect();
  }
  function send(completed: boolean) {
    if (!survey || finished || disposed || !canAnswerPlusSurvey(owner)) return;
    markShown();
    track('survey sent', { ...context(), $survey_submission_id: submission, $survey_completed: completed,
      $survey_questions: survey.questions.map(({ id, question }) => ({ id, question })),
      ...Object.fromEntries(Object.entries(answers).map(([id, value]) => [`$survey_response_${id}`, value])) });
    remember();
    if (completed) finished = true;
  }
  function finish() {
    if (!answered) return;
    send(true); form.hidden = true; choices.hidden = true;
    output.textContent = 'Gracias. Tu respuesta nos ayuda a mejorar Plus.';
    close.setAttribute('aria-label', 'Cerrar encuesta');
  }
  close.onclick = () => {
    if (disposed || !survey || !eligible) return;
    markShown();
    if (answered) send(true);
    else { track('survey dismissed', context()); finished = true; remember(); }
    panel.hidden = true;
  };
  form.onsubmit = event => {
    event.preventDefault();
    if (!eligible || disposed || finished || !survey) return;
    const value = comment.value.trim();
    if (value && survey.questions[1]) answers[survey.questions[1].id!] = value.slice(0, 1000);
    finish();
  };
  panel.querySelector<HTMLButtonElement>('[data-survey-skip]')!.onclick = () => { if (eligible) finish(); };
  function render() {
    if (!survey || shown || !eligible || disposed || finished) return;
    shown = true; submission = crypto.randomUUID();
    title.textContent = survey.questions[0].question;
    choices.replaceChildren(...survey.questions[0].choices.map(choice => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'plus-survey__choice'; button.textContent = choice;
      button.onclick = () => {
        if (!eligible || disposed || answered || finished) return;
        answered = true; answers[survey!.questions[0].id!] = choice;
        choices.hidden = true; close.setAttribute('aria-label', 'Terminar encuesta');
        output.textContent = 'Tu respuesta ya quedó guardada.';
        const followup = survey!.questions[1];
        if (followup) {
          send(false); title.textContent = followup.question;
          form.querySelector('label')!.textContent = followup.question;
          form.hidden = false; comment.focus({ preventScroll: true });
        } else finish();
      };
      return button;
    }));
    panel.hidden = false;
    visibility.observe(panel);
  }
  async function update(view: string, session?: CampusSession) {
    if (session && owner && owner !== session.analyticsId) { dispose(); return; }
    eligible = view === 'ready' && session?.authenticated === true && session.plan === 'free'
      && session.analyticsAudience === 'customer' && session.plusTest !== true && Boolean(session.analyticsId)
      && !session.accessBlocked && !session.accessUnavailable;
    panel.hidden = !eligible || !shown || finished;
    if (!eligible) { if (answered && !finished) send(true); return; }
    owner = session!.analyticsId!;
    if (shown || loading || finished) return;
    loading = true;
    try {
      const result = await getPlusSurvey();
      if (!result || disposed || !eligible) return;
      survey = result;
      storageKey = `campus-survey:${PLUS_SURVEY_ID}:${owner}:${survey.current_iteration ?? 0}`;
      try { if (localStorage.getItem(storageKey)) { finished = true; return; } } catch { /* Remote targeting still applies. */ }
      render();
    } catch { /* Optional survey failures never block Plus. */ }
    finally { loading = false; }
  }
  function dispose() {
    disposed = true; eligible = false; panel.hidden = true; visibility.disconnect();
  }
  return { update, dispose };
}
