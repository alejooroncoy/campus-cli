// Explicit event/property contracts: never export text, URLs with parameters,
// academic content, file names, email, OAuth codes or receipts.
export const events = new Set([
  'campus_guest_signup_invite_viewed','campus_guest_signup_started','campus_guest_signup_dismissed',
  'campus_materials_handoff_ready','campus_materials_handoff_copied',
  'campus_plus_offer_viewed','campus_plus_step_viewed','campus_plus_checkout_started','campus_plus_quote_expired','campus_feedback_submitted',
  'campus_agent_response_received','campus_agent_activity','campus_agent_interrupted',
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
  analytics_audience:['customer','internal','test','unknown'],
  plus_step:['guest','ready','university','payment','pending','active','rejected','unavailable','loading'],
  activity:['connecting','search','course','reviews','answer','academic','grades'],
  feedback_kind:['agent','plus'],reason:['resolved','not_resolved','price','unclear_value','payment_difficult','not_needed','technical_problem','other'],
  page: ['home', 'app', 'assistant', 'connect', 'profile', 'turnitin_app', 'plus', 'turnitin', 'professors', 'blackboard_upc', 'chatgpt', 'terminal', 'cli', 'mcp', 'blog', 'privacy', 'other'],
  target: ['app', 'assistant', 'connect', 'profile', 'turnitin_app', 'plus', 'turnitin', 'professors', 'blackboard_upc', 'chatgpt', 'terminal', 'cli', 'mcp', 'blog', 'privacy', 'other', 'plans', 'features', 'whatsapp', 'auth'],
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
const booleans = new Set(['authenticated', 'supported', 'valid', 'new_conversation', 'university_confirmed', 'is_test','is_internal']);
export function safeAnalyticsProperties(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([key, value]) =>
    (['trace_id','conversation_id'].includes(key) && typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))
    || (Object.hasOwn(categories, key) && categories[key].includes(value as string))
    || (numbers.has(key) && typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86_400_000)
    || (booleans.has(key) && typeof value === 'boolean')));
}
export function analyticsPage(path: string): string {
  if (/^\/app\/(?:profes|asistente)\//.test(path)) return 'assistant';
  const routes: Record<string, string> = { '/': 'home', '/app/': 'app', '/app/asistente/': 'assistant', '/app/plus/': 'plus', '/app/copilot/': 'connect', '/app/perfil/': 'profile', '/app/turnitin/': 'turnitin_app', '/turnitin/': 'turnitin', '/profes/': 'professors', '/campus-cli/': 'cli', '/blackboard-upc/': 'blackboard_upc', '/blackboard-chatgpt/': 'chatgpt', '/blackboard-cli/': 'terminal', '/blackboard-mcp/': 'mcp', '/privacidad/': 'privacy' };
  return routes[path] ?? (path.startsWith('/blog/') ? 'blog' : path.startsWith('/blackboard-mcp/') ? 'mcp' : 'other');
}
