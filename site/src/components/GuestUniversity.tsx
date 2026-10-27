import { selectedPlan, track } from '../scripts/analytics';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { chatUniversityCode, chatUniversityCountry, declaredUniversity, filterChatUniversities, guestUniversitySupported, loadUniversityChoices, type UniversityChoice } from '../scripts/guest-university';

export default function GuestUniversity({ selected, authenticated = false, onSelect }: {
  selected: UniversityChoice | null; authenticated?: boolean; onSelect: (value: UniversityChoice) => void | Promise<void>;
}) {
  const [choices, setChoices] = useState<UniversityChoice[]>([]);
  const [input, setInput] = useState('');
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
  const results = filterChatUniversities(choices, input);
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
  return <section className="app-guest-university" aria-labelledby="guest-university-title">
    <p className="app-guest-university__eyebrow">{entryPlan === 'plus' ? 'BIENVENIDO A CAMPUS PLUS' : 'BIENVENIDO A CAMPUS'}</p>
    <h1 id="guest-university-title">¿Dónde estudias?</h1>
    <p id="guest-university-help">Cuéntanos tu universidad. Puedes usar Campus aunque aún no tengamos datos de sus profesores o cursos.</p>
    <form onSubmit={submit} aria-busy={saving}>
      {custom ? <>
        <label htmlFor="guest-university-name">Nombre de tu universidad</label>
        <input className="app-guest-university__name" id="guest-university-name" value={customName} onChange={event => { setCustomName(event.target.value); setError(''); }} minLength={2} maxLength={160} required autoFocus disabled={saving} placeholder="Escribe el nombre completo" />
        <button type="button" className="app-guest-university__other" onClick={() => { setCustom(false); setError(''); }} disabled={saving}>Volver a la lista</button>
      </> : <>
        <label htmlFor="guest-university">Busca o elige tu universidad</label>
        <div className="app-guest-university__search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/lucide.svg#search" /></svg>
          <input id="guest-university" type="search" value={input} onChange={event => { setInput(event.target.value); setSelectedId(null); setError(''); }} placeholder="Nombre, sigla o país" autoComplete="off" aria-describedby="guest-university-help" disabled={loading || !choices.length || saving} />
        </div>
        {loading ? <div className="app-guest-university__loading" role="status"><span className="app-sr-only">Cargando universidades…</span><span className="app-skeleton app-skeleton--line" aria-hidden="true" /><span className="app-skeleton app-skeleton--short" aria-hidden="true" /></div> : null}
        {!loading && choices.length ? <>
          <p className="app-guest-university__results-label" role="status">{input.trim() ? `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'}` : 'Sugerencias'}</p>
          {results.length ? <fieldset className="app-guest-university__results" disabled={saving}>
            <legend className="app-sr-only">Selecciona una universidad</legend>
            {results.map(item => {
              const details = [chatUniversityCode(item) || item.shortName, chatUniversityCountry(item)].filter(Boolean).join(' · ');
              return <label key={item.id} className="app-guest-university__option" data-selected={selectedId === item.id}>
                <input type="radio" name="university" value={item.id!} checked={selectedId === item.id} onChange={() => { setSelectedId(item.id); setPicked(true); }} />
                <span className="app-guest-university__option-text"><strong>{item.name}</strong>{details ? <span>{details}</span> : null}</span>
              </label>;
            })}
          </fieldset> : <div className="app-guest-university__empty"><strong>No encontramos esa universidad</strong><p>Puedes escribir su nombre y continuar con Campus.</p></div>}
        </> : null}
        <button type="button" className="app-guest-university__other" onClick={() => { setCustom(true); setCustomName(input); setPicked(true); setError(''); }} disabled={saving}>Mi universidad no aparece</button>
        {!loading && !choices.length ? <button type="button" className="app-guest-university__other" onClick={() => setAttempt(value => value + 1)}>Volver a intentar</button> : null}
      </>}
      {choice && !guestUniversitySupported(choice) ? <p className="app-guest-university__coverage" role="status">Podrás usar el agente para estudiar y preparar tus trabajos. Todavía no tenemos datos de profesores o cursos de esta universidad.</p> : null}
      {error ? <p role="alert" className="app-guest-university__error">{error}</p> : null}
      <button type="submit" className="app-guest-university__continue" disabled={!choice || saving}>{saving ? 'Guardando…' : 'Empezar con Campus'}<svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/lucide.svg#arrow-right" /></svg></button>
    </form>
    <p className="app-guest-university__note">{authenticated ? 'Se guardará en tu perfil.' : 'Conservaremos tu elección si creas una cuenta.'} Conectar tu Aula Virtual es un paso aparte.</p>
    {selected ? <button type="button" className="app-guest-university__back" onClick={() => { void choose(selected, 'saved'); }} disabled={saving}>Volver al chat</button> : null}
  </section>;
}
