import type { Survey } from '@posthog/core';

export const PLUS_SURVEY_ID = '01a18cc9-dfcf-0000-9228-5fe27651e15d';
export const surveyEvents = new Set(['survey shown', 'survey sent', 'survey dismissed']);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
export type PlusSurvey = Survey & { questions: [Survey['questions'][number] & { type: 'single_choice'; choices: string[] }, ...Survey['questions']] };

// Only this deliberately answered survey may carry response text through analytics.
// Keep the general analytics contract closed to prompts, documents and form fields.
export function safeSurveyProperties(event: string, input: Record<string, unknown>): Record<string, unknown> {
  if (!surveyEvents.has(event) || input.$survey_id !== PLUS_SURVEY_ID) return {};
  const iteration = input.$survey_iteration;
  if (iteration !== null && !(typeof iteration === 'number' && Number.isSafeInteger(iteration) && iteration >= 0)) return {};
  const safe: Record<string, unknown> = { $survey_id: PLUS_SURVEY_ID, $survey_iteration: iteration };
  if (event !== 'survey sent') return safe;
  if (!uuid(input.$survey_submission_id) || typeof input.$survey_completed !== 'boolean' || !Array.isArray(input.$survey_questions)) return {};
  const questions = input.$survey_questions;
  if (!questions.length || questions.length > 2 || questions.some(q => !q || !uuid(q.id) || typeof q.question !== 'string' || q.question.length > 400)) return {};
  Object.assign(safe, { $survey_submission_id: input.$survey_submission_id, $survey_completed: input.$survey_completed,
    $survey_questions: questions.map(q => ({ id: q.id, question: q.question })) });
  for (const q of questions) {
    const value = input[`$survey_response_${q.id}`];
    if (typeof value === 'string' && value.trim() && value.length <= 1000) safe[`$survey_response_${q.id}`] = value;
  }
  return safe;
}

export function surveyPersonProperties(event: string, input: Record<string, unknown>): Record<string, string | boolean> {
  const safe = safeSurveyProperties(event, input);
  if (!safe.$survey_id) return {};
  if (event === 'survey shown') return { $survey_last_seen_date: new Date().toISOString() };
  const suffix = typeof safe.$survey_iteration === 'number' && safe.$survey_iteration > 0 ? `/${safe.$survey_iteration}` : '';
  return { [`$survey_${event === 'survey sent' ? 'responded' : 'dismissed'}/${PLUS_SURVEY_ID}${suffix}`]: true };
}

export function supportedPlusSurvey(survey: Survey): survey is PlusSurvey {
  if (survey.id !== PLUS_SURVEY_ID || survey.type !== 'api' || survey.schedule && survey.schedule !== 'once'
    || survey.current_iteration != null && (!Number.isSafeInteger(survey.current_iteration) || survey.current_iteration < 0)
    || !survey.start_date || !Number.isFinite(Date.parse(survey.start_date)) || Date.parse(survey.start_date) > Date.now()
    || survey.end_date && (!Number.isFinite(Date.parse(survey.end_date)) || Date.parse(survey.end_date) <= Date.now())
    || !Array.isArray(survey.questions) || survey.questions.length < 1 || survey.questions.length > 2) return false;
  // Delivery belongs to the app's ready state; don't silently ignore new remote conditions.
  if (survey.conditions && Object.keys(survey.conditions).length) return false;
  const [choice, comment] = survey.questions;
  return survey.questions.every(q => q && uuid(q.id) && typeof q.question === 'string' && q.question.length > 0 && q.question.length <= 400)
    && choice.type === 'single_choice' && Array.isArray(choice.choices) && choice.choices.length >= 2 && choice.choices.length <= 20 && !choice.hasOpenChoice
    && choice.choices.every(c => typeof c === 'string' && c.trim().length > 0 && c.length <= 200)
    && new Set(choice.choices).size === choice.choices.length
    && (!comment || comment.type === 'open' && comment.optional === true);
}
