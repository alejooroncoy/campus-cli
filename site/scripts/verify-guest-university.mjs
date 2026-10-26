import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: [new URL('../src/scripts/guest-university.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', write: false });
let sequence = 0;
const load = () => import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text + `\n// ${sequence++}`).toString('base64')}`);
const saved = { window: globalThis.window, fetch: globalThis.fetch };
const storage = new Map();
globalThis.window = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
const upc = { id: 1, name: 'Universidad Peruana de Ciencias Aplicadas', shortName: 'UPC' };
const upn = { id: 40, name: 'Universidad Privada del Norte', shortName: null };
const palermo = { id: 90, name: 'Universidad de Palermo', shortName: 'UP' };
const pacifico = { id: 25, name: 'Universidad del Pacífico', shortName: null };
const other = { id: 2, name: 'Universidad de ejemplo', shortName: null };
const response = (value, ok = true) => ({ ok, json: async () => value });
try {
  let api = await load();
  assert.equal(api.readGuestUniversity(), null);
  api.rememberGuestUniversity(upc);
  api = await load();
  assert.deepEqual(api.readGuestUniversity(), upc, 'The explicit choice survives a new page/module after authentication redirects');
  assert.equal(api.guestUniversitySupported(upc), true);
  for (const [choice, code] of [[upn, 'UPN'], [palermo, 'UP'], [pacifico, 'UP']]) {
    assert.equal(api.guestUniversitySupported(choice), true, 'Catalog entries without short names still have chat coverage');
    assert.equal(api.chatUniversityCode(choice), code);
    assert.equal(api.universityLabel(choice), `${code} — ${choice.name}${code === 'UP' ? ` · ${choice === palermo ? 'Argentina' : 'Perú'}` : ''}`);
    api.rememberGuestUniversity(choice);
    api = await load();
    assert.deepEqual(api.readGuestUniversity(), choice);
  }
  api.rememberGuestUniversity(upc);
  assert.equal(api.guestUniversitySupported(other), false);
  assert.deepEqual(api.universitySearchMatches([palermo,pacifico], 'UP').map(u=>u.id),[90,25]);
  assert.deepEqual(api.universitySearchMatches([pacifico,palermo], 'UP').map(u=>u.id),[25,90],'Catalog order cannot resolve an ambiguous acronym');
  for (const choice of [palermo,pacifico]) {
    assert.deepEqual(api.universitySearchMatches([palermo,pacifico],choice.name),[choice]);
    assert.deepEqual(api.universitySearchMatches([palermo,pacifico],api.universityLabel(choice)),[choice]);
  }
  const catalog=[upc,upn,palermo,pacifico,other];
  assert.deepEqual(api.filterChatUniversities(catalog,''),[upc,upn,palermo,pacifico]);
  assert.deepEqual(api.filterChatUniversities(catalog,'UP'),[palermo,pacifico],'A shared acronym keeps both options visible for an explicit choice');
  assert.deepEqual(api.filterChatUniversities(catalog,'pacifico'),[pacifico]);
  assert.deepEqual(api.filterChatUniversities(catalog,'norte privada'),[upn]);
  assert.deepEqual(api.filterChatUniversities(catalog,'argentina'),[palermo]);
  assert.deepEqual(api.filterChatUniversities(catalog,'ejemplo'),[other],'Unsupported catalog results remain visible with their availability');
  assert.deepEqual(api.filterChatUniversities(catalog,'inexistente'),[]);
  let calls = [];
  let verifiedUniversity = upc;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('universities')) return response({ universities: [upc, upn, palermo, pacifico, other] });
    if (url.endsWith('university')) return response({ universityConfirmed: true });
    return response({ authenticated: true, email: 'new@example.invalid', universityConfirmed: true, university: verifiedUniversity, profesAvailable: true, aiReady: true });
  };
  const fresh = { authenticated: true, email: 'new@example.invalid', universityConfirmed: false, aiReady: true };
  const verified = await api.carryGuestUniversity(fresh, () => true);
  assert.equal(verified.universityConfirmed, true);
  assert.equal(verified.profesAvailable, true);
  assert.equal(JSON.parse(calls.find(call => call.init?.method === 'POST').init.body).universityId, 1);
  assert.deepEqual(calls.map(call => call.url), ['/api/app/universities', '/api/app/university', '/api/app/session']);
  for (const choice of [upn, palermo, pacifico]) {
    calls = []; verifiedUniversity = choice; api.rememberGuestUniversity(choice);
    const carried = await api.carryGuestUniversity(fresh, () => true);
    assert.equal(carried.university.id, choice.id);
    assert.equal(JSON.parse(calls.find(call => call.init?.method === 'POST').init.body).universityId, choice.id);
  }
  verifiedUniversity = upc; api.rememberGuestUniversity(upc);
  calls = [];
  const configured = { ...fresh, universityConfirmed: true, university: other };
  assert.equal(await api.carryGuestUniversity(configured, () => true), configured);
  const guest = { authenticated: false, aiReady: true };
  assert.equal(await api.carryGuestUniversity(guest, () => true), guest);
  assert.equal(await api.carryGuestUniversity(fresh, () => false), fresh);
  assert.equal(await api.carryGuestUniversity({ ...fresh, universityConfirmed: undefined }, () => true).then(s => s.universityConfirmed), undefined);
  assert.equal(calls.length, 0, 'Guest, configured, stale and unverified sessions cannot write university data');

  window.location = { pathname: '/app/perfil/', search: '?universidad=pendiente&return=%2Fapp%2Fasistente%2F' };
  assert.equal(await api.carryGuestUniversity(fresh, () => true), fresh, 'Explicit recovery owns writes after an automatic save fails');
  assert.equal(calls.length, 0);
  window.location = { pathname: '/app/asistente/c/118adac7-9134-4f9e-b751-a145605de41c/', search: '' };

  api = await load();
  globalThis.fetch = async url => response(url.endsWith('universities') ? { universities: [upc] } : {}, false);
  assert.equal(await api.carryGuestUniversity(fresh, () => true), fresh, 'Network/API failure keeps explicit profile setup and never invents confirmed coverage');
  assert.deepEqual(api.readGuestUniversity(), upc, 'A failed save retains the choice for recovery');

  api = await load(); let current = true; calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); current = false; return response({ universities: [upc] }); };
  assert.equal(await api.carryGuestUniversity(fresh, () => current), fresh);
  assert.equal(calls.length, 1, 'Session invalidation while loading choices prevents the write');

  api = await load();
  storage.set(api.GUEST_UNIVERSITY_KEY, JSON.stringify({ version: 1, university: { ...upc, id: -1 } }));
  assert.equal(api.readGuestUniversity(), null, 'Malformed persisted choices cannot skip first-visit selection');
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('Storage denied'); } });
  api.rememberGuestUniversity(upc);
  assert.deepEqual(api.readGuestUniversity(), upc, 'The current visit works even if browser storage is blocked');
  console.log('Guest university: first visit, persistence, authenticated carry-over, existing-account protection, unsupported coverage, invalidation and failure recovery pass.');
} finally { Object.assign(globalThis, saved); }
