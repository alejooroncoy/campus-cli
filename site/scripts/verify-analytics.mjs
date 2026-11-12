import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const deployConfig = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const csp = deployConfig.headers.flatMap(rule => rule.headers).find(header => header.key === 'Content-Security-Policy').value;
assert.match(csp, /connect-src[^;]*https:\/\/us\.i\.posthog\.com/);
assert.deepEqual(deployConfig.rewrites.slice(0, 3), [
  { source: '/c-events/static/:path(.*)', destination: 'https://us-assets.i.posthog.com/static/:path' },
  { source: '/c-events/array/:path(.*)', destination: 'https://us-assets.i.posthog.com/array/:path' },
  { source: '/c-events/:path(.*)', destination: 'https://us.i.posthog.com/:path' },
]);
assert.doesNotMatch(csp.split(';').find(rule => rule.trim().startsWith('script-src')), /posthog|unsafe-eval|unsafe-inline/);
const { outputFiles } = await build({ entryPoints: ['src/scripts/analytics-contract.ts'], bundle: true, format: 'esm', write: false });
const { safeAnalyticsProperties, analyticsPage } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const webBundle = await build({ entryPoints: ['src/scripts/web-analytics.ts'], bundle: true, format: 'esm', write: false });
const { metaCampaign, engageCampaign, safeWebProperties, webPageProperties, ScrollDepth } = await import(`data:text/javascript;base64,${Buffer.from(webBundle.outputFiles[0].text).toString('base64')}`);
assert.deepEqual(safeWebProperties({
  $web_vitals_LCP_value: 1234, $web_vitals_CLS_value: 0.05, $web_vitals_INP_value: Infinity,
  $web_vitals_FCP_value: -1, $web_vitals_LCP_event: { entries: [{ name: 'private' }], attribution: { url: 'private' } },
  $prev_pageview_max_scroll_percentage: 4, $prev_pageview_last_scroll: NaN,
}), { $prev_pageview_max_scroll_percentage: 1, $web_vitals_CLS_value: 0.05, $web_vitals_LCP_value: 1234 });
const depth = new ScrollDepth();
depth.measure({ scrollHeight: 2000, clientHeight: 500, scrollTop: 750 });
depth.measure({ scrollHeight: 2000, clientHeight: 500, scrollTop: 0 });
assert.equal(depth.properties().$prev_pageview_max_scroll_percentage, 0.5);
assert.equal(depth.properties().$prev_pageview_last_scroll_percentage, 0);
assert.equal(depth.properties().$prev_pageview_max_content_percentage, 0.625);
const shortPage = new ScrollDepth();
shortPage.measure({ scrollHeight: 500, clientHeight: 500, scrollTop: -5 });
assert.equal(shortPage.properties().$prev_pageview_max_scroll_percentage, 1);
assert.equal(shortPage.properties().$prev_pageview_last_scroll, 0);
for (const content of ['remontada_upecinos','mejoralo_upecinos','remontada_virtualidad','mejoralo_virtualidad','remontada_working_student','mejoralo_working_student']) {
  const search = `?utm_source=viva_engage&utm_medium=social&utm_campaign=grupo_de_la_u&utm_content=${content}&email=private@example.org`;
  const expected = {utm_source:'viva_engage',utm_medium:'social',utm_campaign:'grupo_de_la_u',utm_content:content};
  assert.deepEqual(engageCampaign(search), expected);
  assert.deepEqual(safeWebProperties(expected), expected);
  const page = webPageProperties('/', 'https://campuscli.com', '', 1000, search);
  for (const [key, value] of Object.entries(expected)) assert.equal(page[key], value);
  assert.equal(JSON.stringify(page).includes('private'), false);
}
for (const query of [
  '?utm_source=viva_engage&utm_medium=social&utm_campaign=grupo_de_la_u&utm_content=private@example.org',
  '?utm_source=viva_engage&utm_medium=social&utm_campaign=grupo_de_la_u&utm_content=remontada_upecinos&utm_content=mejoralo_upecinos',
  '?utm_source=viva_engage&utm_source=email&utm_medium=social&utm_campaign=grupo_de_la_u&utm_content=remontada_upecinos',
  '?utm_source=viva_engage&utm_medium=other&utm_campaign=grupo_de_la_u&utm_content=remontada_upecinos',
  '?utm_source=viva_engage&utm_medium=social&utm_campaign=other&utm_content=remontada_upecinos',
]) assert.deepEqual(engageCampaign(query), {});
assert.deepEqual(safeWebProperties({utm_source:'viva_engage',utm_medium:'social',utm_campaign:'grupo_de_la_u',utm_content:'private@example.org'}), {});
const whatsappSearch = '?utm_source=whatsapp&utm_medium=social&utm_campaign=mismo_prompt';
const whatsappLabels = { utm_source: 'whatsapp', utm_medium: 'social', utm_campaign: 'mismo_prompt' };
for (const [key, value] of Object.entries(whatsappLabels)) {
  assert.equal(webPageProperties('/', 'https://campuscli.com', '', 400, whatsappSearch)[key], value);
}
assert.deepEqual(safeWebProperties({ ...whatsappLabels, utm_content: 'private@example.org' }), whatsappLabels);
assert.deepEqual(safeWebProperties({ ...whatsappLabels, utm_campaign: 'private@example.org' }), {});
for (const search of [
  whatsappSearch + '&utm_campaign=mismo_prompt',
  whatsappSearch + '&utm_content=private@example.org',
  whatsappSearch.replace('mismo_prompt', 'other_campaign'),
  whatsappSearch.replace('social', 'other'),
]) {
  const page = webPageProperties('/', 'https://campuscli.com', '', 400, search);
  assert.ok(!('utm_source' in page) && !('utm_campaign' in page));
}
assert.deepEqual(metaCampaign('?utm_source=meta&utm_campaign=123456789012345&email=private@example.org'), {utm_source:'meta',utm_campaign:'123456789012345'});
for(const source of ['facebook','instagram','fb','ig'])assert.deepEqual(metaCampaign(`?utm_source=${source}&utm_campaign=123456789012345`),{utm_source:'meta',utm_campaign:'123456789012345'});
for (const search of ['?utm_source=meta&utm_campaign=private-name', '?utm_source=meta&utm_campaign=123456&utm_campaign=999999', '?utm_source=other&utm_campaign=123456', '?utm_source=meta&utm_campaign=private%40example.org']) assert.deepEqual(metaCampaign(search), {});
assert.deepEqual(safeWebProperties({utm_source:'meta',utm_campaign:'private@example.org'}), {});
const landing = webPageProperties('/', 'https://campuscli.com', '', 1000, '?utm_source=meta&utm_campaign=123456789&code=private');
assert.equal(landing.utm_campaign, '123456789'); assert.equal(JSON.stringify(landing).includes('private'), false);
assert.deepEqual(safeAnalyticsProperties({ current_plan: 'plus', selected_plan: 'free', remaining: 100, authenticated: true,
  email: 'private@example.org', message: 'private question', receipt: 'base64', $current_url: '/?code=private',
  page: 'private-course', toString: 'private', duration_ms: Infinity, limit: -1 }), {
  current_plan: 'plus', selected_plan: 'free', remaining: 100, authenticated: true,
});
assert.deepEqual(safeAnalyticsProperties({failure_reason:'not_found',callback_requested:true,whatsappPhone:'+51999999999',phone:'+51999999999',details:'private complaint',whatsappConsent:true}),{failure_reason:'not_found',callback_requested:true});
assert.deepEqual(safeAnalyticsProperties({failure_reason:'private complaint'}),{});
assert.deepEqual(safeAnalyticsProperties({location:'professor_profile',target:'assistant',intent:'ask',slug:'ana-prueba'}),{location:'professor_profile',target:'assistant',intent:'ask'});
assert.equal(analyticsPage('/app/asistente/'), 'assistant');
assert.equal(analyticsPage('/app/asistente/c/private-id/'), 'assistant');
assert.equal(analyticsPage('/app/profes/c/private-id/'), 'assistant');
assert.equal(analyticsPage('/private-unrecognized-route'), 'other');
assert.equal(analyticsPage('/app/perfil/'), 'profile');
// Public acquisition pages must be distinguishable without exporting raw URLs.
for (const [path, page] of [
  ['/blackboard-upc/', 'blackboard_upc'],
  ['/blackboard-chatgpt/', 'chatgpt'],
  ['/blackboard-cli/', 'terminal'],
  ['/blackboard-mcp/claude-desktop/', 'mcp'],
]) {
  assert.equal(analyticsPage(path), page);
  assert.deepEqual(safeAnalyticsProperties({ page, target: page, url: path + '?code=private' }), { page, target: page });
}
for (const [path, page] of [
  ['/profes/upc/', 'professor_directory'],
  ['/profes/upc/luis-vives', 'professor_profile'],
  ['/profes/upc/luis-vives/escribir/?code=private#private', 'professor_review_form'],
  ['/profes/resenas/', 'professor_reviews'],
  ['/biblioteca/', 'library'], ['/biblioteca/trabajo-privado/', 'library_item'],
  ['/app/biblioteca/', 'library_app'], ['/opiniones-campus/', 'campus_reviews'],
  ['/about/', 'about'], ['/contacto/', 'contact'], ['/terminos/', 'terms'],
  ['/no-afiliacion/', 'independence'], ['/app/asistente?code=private', 'assistant'],
]) {
  assert.equal(analyticsPage(path), page, path);
  assert.deepEqual(safeAnalyticsProperties({ page, target: page, url: path }), { page, target: page });
}
assert.deepEqual(safeAnalyticsProperties({ example: 'professor_reviews', selection_method: 'quick', prompt: 'private' }), { example: 'professor_reviews', selection_method: 'quick' });
assert.deepEqual(safeAnalyticsProperties({ example: 'private question', selection_method: 'private' }), {});
assert.equal(analyticsPage('/profes/upc/private/private/?code=secret'), 'other');
const storage = new Map(); const remote = [];
globalThis.window = {}; globalThis.location = { hostname: '127.0.0.1', pathname: '/', origin: 'http://127.0.0.1:4336' };
globalThis.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
globalThis.innerWidth = 1440; globalThis.fetch = (...args) => { remote.push(args); throw Error('Remote metrics must be disabled locally'); };
const bundled = await build({ entryPoints: ['src/scripts/analytics.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
  define: { 'import.meta.env': JSON.stringify({ DEV: false, PUBLIC_POSTHOG_KEY: 'public-test-key', PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com' }) } });
const savedDebug = console.debug; console.debug = () => {};
try {
  const analytics = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  for (let i = 0; i < 105; i++) analytics.track('campus_cta_clicked', { intent: 'plus', message: 'private' });
  const records = JSON.parse(storage.get('campus-analytics-debug'));
  assert.equal(records.length, 100); assert.equal(records[0].properties.environment, 'development');
  assert.equal('is_test' in records[0].properties,false,'An unresolved session must never be classified as a real user');
  assert.equal(records.some(item => JSON.stringify(item).includes('private')), false);
  analytics.analyticsSession({ authenticated: true, plan: 'plus', aiReady: true, analyticsId: 'campus:account_uuid1234', usage: { remaining: 97, limit: 100, period: 'day' } });
  analytics.analyticsSession({ authenticated: true, plan: 'plus', aiReady: true, analyticsId: 'campus:account_uuid1234', usage: { remaining: 97, limit: 100, period: 'day' } });
  assert.equal(JSON.parse(storage.get('campus-analytics-debug')).filter(item => item.event === 'campus_session_ready').length, 1);
  analytics.analyticsSession({ authenticated: true, plan: 'plus', aiReady: true, analyticsId: 'campus:account_uuid1234', usage: { remaining: 96, limit: 100, period: 'day' } });
  assert.equal(JSON.parse(storage.get('campus-analytics-debug')).filter(item => item.event === 'campus_session_ready').length, 1, 'A new balance is not another app entry');
  assert.equal(JSON.parse(storage.get('campus-analytics-debug')).filter(item => item.event === 'campus_usage_updated').length, 1);
  analytics.analyticsSession({authenticated:true,plan:'plus',plusTest:true,aiReady:true,analyticsId:'campus:account_uuid1234'});
  analytics.track('campus_plus_status_viewed',{plus_status:'active'});
  assert.equal(JSON.parse(storage.get('campus-analytics-debug')).at(-1).properties.is_test,true);
  analytics.track('unknown_event', { email: 'private' });
  assert.equal(remote.length, 0);
  assert.equal(analytics.analyticsHeaders()['X-POSTHOG-DISTINCT-ID'], 'campus:account_uuid1234');
} finally { console.debug = savedDebug; }
console.log('Analytics: property redaction, normalized routes, bounded local buffer, no remote requests, session deduplication and correlation headers pass.');

// Exercise the production SDK boundary with a local fake, never PostHog Cloud.
let config, distinct = 'campus:previous_account', resets = 0;
const captured = [], identified = [];
const sdk = {
  get_distinct_id: () => distinct, get_session_id: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  reset: () => { resets++; distinct = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'; },
  identify: id => { identified.push(id); distinct = id; },
  capture: (event, properties) => captured.push(config.before_send({ event, properties: {
    ...properties, distinct_id: distinct, $current_url: '/?code=private', $referrer: 'private',
    $set: { email: 'private@example.org' }, $session_id: sdk.get_session_id(),
  } })),
};
globalThis.__campusPostHogFixture = { init: (_key, settings) => { config = settings; return sdk; } };
globalThis.location = { hostname: 'campuscli.com', pathname: '/app/asistente/', origin: 'https://campuscli.com' };
const production = await build({ entryPoints: ['src/scripts/analytics.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
  define: { 'import.meta.env': JSON.stringify({ DEV: false, PUBLIC_POSTHOG_KEY: 'public-test-key', PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com' }) },
  plugins: [{ name: 'fake-posthog', setup(build) {
    build.onResolve({ filter: /analytics-client$/ }, () => ({ path: 'sdk', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const createAnalyticsClient = (...args) => globalThis.__campusPostHogFixture.init(...args);', loader: 'js' }));
  } }],
});
const live = await import(`data:text/javascript;base64,${Buffer.from(production.outputFiles[0].text).toString('base64')}`);
live.analyticsSession({ authenticated: false, plan: 'anon', aiReady: true });
await new Promise(resolve => setImmediate(resolve));
assert.equal(resets, 1, 'A verified guest must not keep a previously identified account');
assert.equal(config.host, 'https://campuscli.com/c-events');
const proxyMarker = config.before_send({ event: '$pageview', properties: { $lib_custom_api_host: 'https://private.invalid' } });
assert.equal(proxyMarker.properties.$lib_custom_api_host, config.host, 'Proxy detection must reflect the configured transport, never event input');
assert.equal(config.before_send({ event: '$autocapture', properties: { text: 'private' } }), null);
const campaignLanding = config.before_send({event:'$pageview',properties:{$current_url:'https://campuscli.com/', $pathname:'/',utm_source:'meta',utm_campaign:'123456789',email:'private@example.org'}});
assert.equal(campaignLanding.properties.$process_person_profile, true);
assert.equal(campaignLanding.properties.utm_campaign, '123456789');
assert.equal(JSON.stringify(campaignLanding).includes('private'), false);
live.analyticsSession({ authenticated: true, plan: 'plus', analyticsId: 'campus:account_uuid1234', aiReady: true });
live.analyticsSession({ authenticated: true, plan: 'plus', analyticsId: 'campus:account_uuid1234', aiReady: true });
assert.deepEqual(identified, ['campus:account_uuid1234']);
live.track('campus_cta_clicked', { intent: 'plus', email: 'private@example.org' });
assert.equal(JSON.stringify(captured).includes('private'), false, 'SDK-added URL/referrer/person fields must be removed');
assert.equal(captured.at(-1).properties.distinct_id, 'campus:account_uuid1234');
assert.equal(captured.at(-1).properties.token, 'public-test-key', 'Privacy filtering must preserve ingestion authentication');
live.analyticsSession({ authenticated: true, plan: 'free', analyticsId: 'campus:google:123456789012345678901', aiReady: true });
assert.equal(identified.at(-1), 'campus:google:123456789012345678901', 'Real Google subject format must identify the buyer');
assert.equal(live.analyticsHeaders()['X-POSTHOG-DISTINCT-ID'], 'campus:google:123456789012345678901');
const normalizedGoogle='campus:google_'+'a'.repeat(64);
live.analyticsSession({authenticated:true,plan:'free',analyticsId:normalizedGoogle,aiReady:true});
assert.equal(identified.at(-1),normalizedGoogle,'Normalized non-numeric or long Google subjects must identify the buyer');
const identify = config.before_send({ event: '$identify', $set:{email:'private'}, $set_once:{$initial_current_url:'private'}, properties: { distinct_id: distinct, $anon_distinct_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', $set: { email: 'private' } } });
assert.equal(identify.properties.$anon_distinct_id, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
assert.equal('$set' in identify.properties, false);
assert.equal('$set' in identify,false);assert.equal('$set_once' in identify,false);
assert.equal(identify.properties.token, 'public-test-key');
live.analyticsSession({authenticated:true,analyticsAudience:'test',plan:'free',analyticsId:normalizedGoogle,aiReady:true});
live.track('campus_plus_checkout_started',{is_test:false,plus_step:'ready',message:'private'});
assert.equal(captured.at(-1).properties.is_test,true,'An event cannot reclassify a QA identity as a customer');
assert.equal(captured.at(-1).properties.analytics_audience,'test');
assert.deepEqual(captured.at(-1).$set,{analytics_audience:'test',is_test:true,is_internal:false});
assert.deepEqual(safeAnalyticsProperties({trace_id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',conversation_id:'private',reason:'private',feedback_kind:'agent'}),{trace_id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',feedback_kind:'agent'});

storage.set('campus-account-handoff-v1', JSON.stringify({ startedAt: Date.now(), returnPath: '/app/profes/', completed: false }));
live.analyticsSession({ authenticated: false, plan: 'anon', aiReady: true });
assert.equal(captured.filter(item => item.event === 'campus_account_access_completed').length, 0);
const freshFree = { authenticated: true, plan: 'free', analyticsId: 'campus:new_account_1234', aiReady: true, universityConfirmed: true, usage: { remaining: 25, limit: 25, period: 'lifetime' } };
live.analyticsSession({ ...freshFree, accessUnavailable: true });
assert.equal(captured.filter(item => item.event === 'campus_account_access_completed').length, 0, 'Unavailable identity/balance never counts as completion');
live.analyticsSession(freshFree); live.analyticsSession(freshFree);
const completed = captured.filter(item => item.event === 'campus_account_access_completed');
assert.equal(completed.length, 1, 'One conversion per explicit sign-in, never a second one on refresh');
assert.equal(completed[0].properties.current_plan, 'free'); assert.equal(completed[0].properties.limit, 25);
assert.equal(completed[0].properties.university_confirmed, true);
live.resetAnalytics(); assert.equal(resets, 3);
assert.equal(remote.length, 0);
console.log('Analytics production boundary: fake SDK initialization, private-field stripping, guest reset, stable account identity and anonymous merge pass. No cloud requests.');

// A smooth anchor jump must not count every heading it passes as engagement.
const pendingTimers = new Map(), listeners = new Map(); let nextTimer = 0, intersection;
const headings = new Map(['#planes', '#incluye', '#investigacion', '#como-empezar', '.cp-faq', '.cp-final'].map(key => [key, { dataset: {} }]));
globalThis.setTimeout = fn => { const id = ++nextTimer; pendingTimers.set(id, fn); return id; };
globalThis.clearTimeout = id => pendingTimers.delete(id);
globalThis.IntersectionObserver = class { constructor(callback) { intersection = callback; } observe() {} disconnect() {} };
globalThis.document = { visibilityState: 'visible', querySelector: key => headings.has(key) ? { querySelector: () => headings.get(key) } : null,
  addEventListener: (key, fn) => listeners.set(key, fn) };
globalThis.window.addEventListener = () => {};
globalThis.location = { hostname: '127.0.0.1', pathname: '/', origin: 'http://127.0.0.1:4336' };
storage.clear();
const dwell = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text + '\n// dwell fixture').toString('base64')}`);
const flushTimers = () => { const callbacks = [...pendingTimers.values()]; pendingTimers.clear(); callbacks.forEach(fn => fn()); };
console.debug = () => {};
try {
  dwell.setupAnalytics();
  const entry = (key, isIntersecting) => ({ target: headings.get(key), isIntersecting });
  intersection([entry('#incluye', true)]); intersection([entry('#incluye', false)]);
  intersection([entry('#investigacion', true)]); intersection([entry('#investigacion', false)]);
  flushTimers();
  const sectionEvents = () => JSON.parse(storage.get('campus-analytics-debug')).filter(item => item.event === 'campus_section_viewed');
  assert.equal(sectionEvents().length, 0, 'Passing headings during smooth scrolling is not a view');
  intersection([entry('#planes', true)]); flushTimers();
  intersection([entry('#planes', true)]); flushTimers();
  assert.deepEqual(sectionEvents().map(item => item.properties.section), ['plans'], 'One view per section per visit');
  intersection([entry('#incluye', true)]); document.visibilityState = 'hidden'; listeners.get('visibilitychange')(); flushTimers();
  assert.equal(sectionEvents().length, 1, 'Background time does not count');
  document.visibilityState = 'visible'; listeners.get('visibilitychange')(); flushTimers();
  assert.equal(sectionEvents().length, 2, 'Visible foreground dwell can count again');
  class AppBrand {
    constructor(path = '/app/', management = false) { this.href = `http://127.0.0.1:4336${path}`; this.management = management; }
    closest(selector) { return selector === 'a[href]' ? this : null; }
    hasAttribute(name) { return name === 'data-profile-manage' && this.management; }
  }
  globalThis.Element = AppBrand;
  location.pathname = '/app/asistente/';
  storage.set('campus-selected-plan', 'plus');
  listeners.get('click')({ target: new AppBrand() });
  assert.equal(dwell.selectedPlan(), 'plus', 'Returning to the assistant inside the app preserves Plus interest');
  assert.equal(JSON.parse(storage.get('campus-analytics-debug')).at(-1).properties.intent, 'navigate');
  storage.set('campus-selected-plan', 'free');
  listeners.get('click')({ target: new AppBrand('/app/plus/', true) });
  assert.equal(JSON.parse(storage.get('campus-analytics-debug')).at(-1).properties.intent, 'navigate', 'Plan management is not acquisition, even before session resolution');
  assert.equal(dwell.selectedPlan(), 'free');
  dwell.analyticsSession({ authenticated: true, plan: 'plus', analyticsId: 'campus:account_uuid1234' });
  listeners.get('click')({ target: new AppBrand('/app/plus/') });
  assert.equal(JSON.parse(storage.get('campus-analytics-debug')).at(-1).properties.intent, 'navigate', 'Existing Plus users navigating from another CTA are not acquisitions');
  dwell.analyticsSession({ authenticated: true, plan: 'free', analyticsId: 'campus:account_uuid1234' });
  listeners.get('click')({ target: new AppBrand('/app/plus/') });
  assert.equal(JSON.parse(storage.get('campus-analytics-debug')).at(-1).properties.intent, 'plus', 'A Free upgrade remains an acquisition');
  assert.equal(dwell.selectedPlan(), 'plus');
  class ProfileAsk extends AppBrand {
    closest(selector) { return selector === 'a[href]' ? this : selector === '.prof-public__ask' ? {} : null; }
  }
  location.pathname = '/profes/upc/ana-prueba/';
  listeners.get('click')({ target: new ProfileAsk('/app/asistente/') });
  assert.deepEqual(
    (({ location, target, intent }) => ({ location, target, intent }))(JSON.parse(storage.get('campus-analytics-debug')).at(-1).properties),
    { location: 'professor_profile', target: 'assistant', intent: 'ask' }, 'The professor profile CTA reaches PostHog with allowlisted location, target and intent');
  assert.equal(dwell.selectedPlan(), 'plus', 'Asking Campus from a profile is not a plan selection');
  location.pathname = '/app/asistente/';
  dwell.track('campus_question_retried', { step: 'question', message: 'private' });
  assert.equal(JSON.parse(storage.get('campus-analytics-debug')).at(-1).event, 'campus_question_retried');
  assert.equal('message' in JSON.parse(storage.get('campus-analytics-debug')).at(-1).properties, false);
} finally { console.debug = savedDebug; }
console.log('Analytics engagement: minimum foreground dwell, no smooth-scroll false impressions and no duplicate section views pass.');


const handoffBundle=await build({entryPoints:['src/scripts/mcp-handoff.ts'],bundle:true,format:'esm',write:false});
const {mcpHandoff,clearMcpHandoff}=await import(`data:text/javascript;base64,${Buffer.from(handoffBundle.outputFiles[0].text).toString('base64')}`);
const handoffMap=new Map(),handoffStorage={getItem:k=>handoffMap.get(k)??null,setItem:(k,v)=>handoffMap.set(k,v),removeItem:k=>handoffMap.delete(k)};
for(const aiClient of ['chatgpt','gemini']){
 const expected={aiClient,aiClientSource:'handoff_url'};
 assert.deepEqual(mcpHandoff(`https://campuscli.com/app/turnitin/?source=mcp&ai_client=${aiClient}&secret=private`,handoffStorage,1000),expected);
 assert.deepEqual(mcpHandoff('https://campuscli.com/app/turnitin/',handoffStorage,2000),expected,'OAuth return retains bounded handoff');
 assert.deepEqual(mcpHandoff('https://campuscli.com/app/turnitin/',handoffStorage,1801001),{},'Old handoffs expire');
}
assert.deepEqual(mcpHandoff('https://campuscli.com/app/turnitin/?source=mcp&ai_client=private@example.test',handoffStorage,1000),{});
assert.deepEqual(mcpHandoff('https://campuscli.com/?source=mcp&ai_client=chatgpt',handoffStorage,1000),{},'Unrelated routes cannot establish a Turnitin handoff');
mcpHandoff('https://campuscli.com/app/turnitin/?source=mcp&ai_client=gemini',handoffStorage,1000);clearMcpHandoff(handoffStorage);
assert.equal(handoffMap.size,0);
assert.deepEqual(safeAnalyticsProperties({aiClient:'gemini',aiClientSource:'handoff_url',download_url:'https://private',aiClientName:'private'}),{aiClient:'gemini',aiClientSource:'handoff_url'});
console.log('MCP handoff: closed ChatGPT/Gemini origin, OAuth return, expiry, logout and redaction passed.');
