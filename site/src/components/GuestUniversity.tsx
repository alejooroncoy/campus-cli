import { selectedPlan, track } from '../scripts/analytics';
import { useEffect, useRef, useState, type CSSProperties, type SubmitEvent } from 'react';
import { chatUniversityCode, chatUniversityCountry, declaredUniversity, filterChatUniversities, guestUniversitySupported, loadUniversityChoices, type UniversityChoice } from '../scripts/guest-university';

// Colores de las tarjetas «Las más elegidas», en el orden en que llegan del catálogo.
const tileColors = ['#8EDCF0', '#F6C35B', '#F59E8B', '#9BE3B8'];

export default function GuestUniversity({ selected, authenticated = false, changing = false, returnHref, onSelect }: {
  selected: UniversityChoice | null; authenticated?: boolean; changing?: boolean; returnHref?: string; onSelect: (value: UniversityChoice) => void | Promise<void>;
}) {
  const [choices, setChoices] = useState<UniversityChoice[]>([]);
  const [input, setInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState(selected?.id ?? null);
  const [custom, setCustom] = useState(selected?.id === null);
  const [customName, setCustomName] = useState(selected?.id === null ? selected.name : '');
  const [picked, setPicked] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [entryPlan, setEntryPlan] = useState<ReturnType<typeof selectedPlan>>();
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void loadUniversityChoices().then(items => { if (active) setChoices(items); })
      .catch(error => { if (active) setError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => { setEntryPlan(selectedPlan()); track('campus_university_step_viewed'); }, []);
  // Sin texto no se lista nada: las más elegidas ya están en la pantalla anterior y repetirlas confunde.
  const results = input.trim() ? filterChatUniversities(choices, input) : [];
  // Las más elegidas: solo las que el backend marca con cobertura (la primera, UPC, va destacada).
  const featured = filterChatUniversities(choices, '');
  const moreCount = Math.max(choices.length - featured.length, 0);
  const choice = custom ? declaredUniversity(customName) : choices.find(item => item.id === selectedId);
  async function choose(value: UniversityChoice, method: 'quick' | 'search' | 'saved') {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setError('');
    try {
      await onSelect(value);
      track('campus_university_selected', { supported: guestUniversitySupported(value), selection_method: method });
    } catch(error) {
      setError(error instanceof Error ? error.message : 'No pudimos guardar tu universidad. Inténtalo otra vez.');
      setSaving(false);
      savingRef.current = false;
    }
  }
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!choice || saving) return;
    void choose(choice, !picked && selected?.id === choice.id && selected?.name === choice.name ? 'saved' : custom || input.trim() ? 'search' : 'quick');
  }
  // UPC es la sugerencia principal: un toque basta. Solo con puntero (detail > 0): las flechas del
  // teclado también disparan clic (detail 0) y no deben cambiar de pantalla al pasar por encima
  // (WCAG 3.2.2). Con búsqueda activa o en otras universidades se mantiene "Empezar con Campus".
  function quickTap(event: { detail: number }, item: UniversityChoice) {
    if (event.detail > 0 && !input.trim() && chatUniversityCode(item) === 'UPC' && !saving) void choose(item, 'quick');
  }
  function pick(item: UniversityChoice) { setSelectedId(item.id); setPicked(true); }
  const unchanged = changing && !!selected && !!choice && choice.id === selected.id && choice.name === selected.name;
  const backControl = selected && returnHref ? <a className="app-gu2__back" href={returnHref}><svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/lucide.svg#arrow-left" /></svg>Volver a mi perfil</a>
    : selected ? <button type="button" className="app-gu2__back" onClick={() => { void choose(selected, 'saved'); }} disabled={saving}><svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/lucide.svg#arrow-left" /></svg>Volver al chat</button> : null;
  return <section className="app-guest-university app-gu2" aria-labelledby="guest-university-title">
    {changing && selected ? <>
      {backControl}
      <h1 id="guest-university-title">Cambiar universidad</h1>
      <p className="app-gu2__current">Ahora: <strong>{selected.id === null ? selected.name : (chatUniversityCode(selected) ? `${chatUniversityCode(selected)} — ${selected.name}` : selected.name)}</strong></p>
    </> : <>
      <div className="app-gu2__hello">
        <img src="/assets/campu-avatar-60.png" srcSet="/assets/campu-avatar-90.png 1.5x" width="48" height="48" alt="Campito" />
        <p className="app-guest-university__eyebrow">{entryPlan === 'plus' ? 'Hola, soy Campito. Vamos con Campus Plus.' : 'Hola, soy Campito.'}</p>
      </div>
      <h1 id="guest-university-title">¿Dónde estudias?</h1>
    </>}
    <form onSubmit={submit} aria-busy={saving}>
      {custom ? <>
        <label htmlFor="guest-university-name">Nombre de tu universidad</label>
        <input className="app-guest-university__name" id="guest-university-name" value={customName} onChange={event => { setCustomName(event.target.value); setError(''); }} minLength={2} maxLength={160} required autoFocus disabled={saving} placeholder="Escribe el nombre completo" />
        <button type="button" className="app-guest-university__other" onClick={() => { setCustom(false); setError(''); }} disabled={saving}>Volver a la lista</button>
      </> : searching ? <>
        <label htmlFor="guest-university">Busca o elige tu universidad</label>
        <div className="app-guest-university__search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/lucide.svg#search" /></svg>
          <input id="guest-university" type="search" value={input} onChange={event => { setInput(event.target.value); setSelectedId(null); setError(''); }} placeholder="Nombre, sigla o país" autoComplete="off" autoFocus disabled={saving} />
        </div>
        <p className="app-guest-university__results-label" role="status">{input.trim() ? `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'}` : 'Escribe para buscar'}</p>
        {results.length ? <fieldset className="app-guest-university__results" disabled={saving}>
          <legend className="app-sr-only">Selecciona una universidad</legend>
          {results.map(item => {
            const details = [chatUniversityCode(item) || item.shortName, chatUniversityCountry(item)].filter(Boolean).join(' · ');
            return <label key={item.id} className="app-guest-university__option" data-selected={selectedId === item.id}>
              <input type="radio" name="university" value={item.id!} checked={selectedId === item.id} onChange={() => pick(item)} onClick={event => quickTap(event, item)} />
              <span className="app-guest-university__option-text"><strong>{item.name}</strong>{details ? <span>{details}</span> : null}</span>
            </label>;
          })}
        </fieldset> : input.trim() ? <div className="app-guest-university__empty"><strong>No encontramos esa universidad</strong><p>Añádela con el nombre que escribiste y continúa con Campus.</p>
          <button type="button" className="app-gu2__search-button app-gu2__add-button" onClick={() => { setCustom(true); setCustomName(input.trim()); setPicked(true); setError(''); }} disabled={saving}>Añadir «{input.trim()}»</button></div> : null}
        <button type="button" className="app-gu2__write-button" onClick={() => { setSearching(false); setInput(''); setError(''); }} disabled={saving}>Volver a las más elegidas</button>
      </> : <>
        {loading ? <div className="app-guest-university__loading" role="status"><span className="app-sr-only">Cargando universidades…</span><span className="app-skeleton app-skeleton--line" aria-hidden="true" /><span className="app-skeleton app-skeleton--short" aria-hidden="true" /></div> : null}
        {!loading && featured.length ? <>
          <h2 className="app-gu2__label">Las más elegidas <span>Con profesores y cursos</span></h2>
          <fieldset className="app-gu2__tiles" disabled={saving}>
            <legend className="app-sr-only">Selecciona una universidad</legend>
            {featured.map((item, index) => {
              const code = chatUniversityCode(item) || item.shortName || item.name.slice(0, 3).toUpperCase();
              const country = chatUniversityCountry(item);
              const details = code === 'UP' && country ? `UP · ${country}` : country;
              return <label key={item.id} className={`app-gu2__tile${index === 0 ? ' is-featured' : ''}`} data-selected={selectedId === item.id} style={{ '--tile': tileColors[index % tileColors.length] } as CSSProperties}>
                <input type="radio" name="university" value={item.id!} checked={selectedId === item.id} onChange={() => pick(item)} onClick={event => quickTap(event, item)} />
                <strong className="app-gu2__code">{code}</strong>
                <span className="app-gu2__name">{item.name}{details ? <span>{details}</span> : null}</span>
              </label>;
            })}
          </fieldset>
        </> : null}
        <section className="app-gu2__more" aria-labelledby="gu2-more-title">
          <h2 id="gu2-more-title">¿No aparece la tuya?</h2>
          <p>{moreCount ? `Hay ${moreCount} universidades más. ` : ''}Búscala por su nombre. Si no está, podrás escribirla y usar Campus igual.</p>
          <div className="app-gu2__more-actions">
            <button type="button" className="app-gu2__search-button" onClick={() => setSearching(true)} disabled={loading || !choices.length || saving}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/lucide.svg#search" /></svg>Buscar
            </button>
          </div>
          {!loading && !choices.length ? <>
            <button type="button" className="app-guest-university__other" onClick={() => setAttempt(value => value + 1)}>Volver a intentar</button>
            <button type="button" className="app-gu2__write-button" onClick={() => { setCustom(true); setCustomName(''); setPicked(true); setError(''); }} disabled={saving}>Escribir su nombre</button>
          </> : null}
        </section>
      </>}
      {choice && !guestUniversitySupported(choice) ? <p className="app-guest-university__coverage" role="status">Podrás usar el agente para estudiar y preparar tus trabajos. Todavía no tenemos datos de profesores o cursos de esta universidad.</p> : null}
      {error ? <p role="alert" className="app-guest-university__error">{error}</p> : null}
      <button type="submit" className="app-guest-university__continue" disabled={!choice || saving || unchanged}>{saving ? 'Guardando…' : changing ? 'Guardar cambio' : 'Empezar con Campus'}<svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/lucide.svg#arrow-right" /></svg></button>
    </form>
    <p className="app-guest-university__note">{authenticated ? 'Se guardará en tu perfil.' : 'Conservaremos tu elección si creas una cuenta.'} Conectar tu Aula Virtual es un paso aparte.</p>
    {!changing ? (selected && returnHref ? <a className="app-guest-university__back" href={returnHref}>Volver a mi perfil</a>
      : selected ? <button type="button" className="app-guest-university__back" onClick={() => { void choose(selected, 'saved'); }} disabled={saving}>Volver al chat</button> : null) : null}
  </section>;
}
