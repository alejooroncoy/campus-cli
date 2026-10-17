// Explicit event/property contracts: never export text, URLs with parameters,
// academic content, file names, email, OAuth codes or receipts.
export const events = new Set([
  'campus_memory_viewed', 'campus_plus_checkout_viewed', 'campus_plus_receipt_selected', 'campus_plus_submit_started', 'campus_plus_status_viewed', 'campus_plus_payment_copied',
  'campus_page_viewed', 'campus_section_viewed', 'campus_cta_clicked',
  'campus_details_opened', 'campus_university_step_viewed', 'campus_university_selected',
  'campus_account_access_completed', 'campus_conversation_restored', 'campus_university_carried',
  'campus_session_ready', 'campus_usage_updated', 'campus_question_submitted', 'campus_answer_displayed',
  'campus_flow_failed', 'campus_question_retried', 'campus_connector_copied', 'campus_upload_selected',
  'campus_turnitin_step_viewed', 'campus_turnitin_payment_copied',
  'campus_turnitin_submit_started', 'campus_turnitin_status_updated', 'campus_turnitin_history_refreshed', 'campus_turnitin_history_filtered',
  'campus_turnitin_reports_opened', 'campus_turnitin_report_requested', 'campus_turnitin_report_displayed', 'campus_turnitin_download_clicked',
  'campus_turnitin_submitted', 'campus_logout_completed',
]);
const categories: Record<string, readonly string[]> = {
  page: ['home', 'app', 'assistant', 'connect', 'profile', 'turnitin_app', 'plus', 'turnitin', 'professors', 'cli', 'mcp', 'blog', 'privacy', 'other'],
  target: ['app', 'assistant', 'connect', 'profile', 'turnitin_app', 'plus', 'turnitin', 'professors', 'cli', 'mcp', 'blog', 'privacy', 'other', 'plans', 'features', 'whatsapp', 'auth'],
  location: ['header', 'hero', 'trial', 'free', 'plus', 'features', 'research', 'onboarding', 'faq', 'closing', 'footer', 'app', 'other'],
  section: ['plans', 'features', 'research', 'onboarding', 'faq', 'closing'],
  intent: ['trial', 'free', 'plus', 'connect', 'turnitin', 'signup', 'support', 'navigate'],
  selected_plan: ['trial', 'free', 'plus'], current_plan: ['guest', 'free', 'plus', 'unavailable'],
  plus_status: ['payment_review', 'active', 'rejected'], offer: ['founder', 'standard'],
  step: ['plus', 'session', 'university', 'question', 'connector', 'upload', 'turnitin', 'document', 'payment', 'report', 'history'],
  error_kind: ['network', 'rejected', 'stream', 'clipboard', 'validation', 'unavailable'],
  order_status: ['all', 'payment_review', 'processing', 'completed', 'payment_rejected'],
  previous_status: ['payment_review', 'processing', 'completed', 'payment_rejected'],
  report_kind: ['similarity', 'ai'],
  provider: ['chatgpt', 'claude', 'gemini'],
  aiClient: ['chatgpt', 'gemini', 'claude', 'cursor', 'vscode'],
  aiClientSource: ['handoff_url'],
  upload_kind: ['document', 'receipt'], copy_kind: ['name', 'url'],
  viewport: ['mobile', 'tablet', 'desktop'], environment: ['development', 'production'],
};
const numbers = new Set(['remaining', 'limit', 'duration_ms', 'position', 'amount_cents']);
const booleans = new Set(['authenticated', 'supported', 'valid', 'new_conversation', 'university_confirmed', 'is_test']);
export function safeAnalyticsProperties(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([key, value]) =>
    (Object.hasOwn(categories, key) && categories[key].includes(value as string))
    || (numbers.has(key) && typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86_400_000)
    || (booleans.has(key) && typeof value === 'boolean')));
}
export function analyticsPage(path: string): string {
  if (/^\/app\/profes\//.test(path)) return 'assistant';
  const routes: Record<string, string> = { '/': 'home', '/app/': 'app', '/app/plus/': 'plus', '/app/copilot/': 'connect', '/app/perfil/': 'profile', '/app/turnitin/': 'turnitin_app', '/turnitin/': 'turnitin', '/profes/': 'professors', '/campus-cli/': 'cli', '/blackboard-mcp/': 'mcp', '/privacidad/': 'privacy' };
  return routes[path] ?? (path.startsWith('/blog/') ? 'blog' : 'other');
}
