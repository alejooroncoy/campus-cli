import { selectedPlan, track } from '../scripts/analytics';
import { useEffect, useState, type SubmitEvent } from 'react';
import { chatUniversityCode, chatUniversityCountry, filterChatUniversities, guestUniversitySupported, loadUniversityChoices, type UniversityChoice } from '../scripts/guest-university';

export default function GuestUniversity({ selected, onSelect }: {
  selected: UniversityChoice | null; onSelect: (value: UniversityChoice) => void;
}) {
  const [choices, setChoices] = useState<UniversityChoice[]>([]);
  const [input, setInput] = useState('');
  const [selectedId, setSelectedId] = useState(selected?.id ?? null);
  const [picked, setPicked] = useState(false);
  const [error, setError] = useState('');
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
  const choice = choices.find(item => item.id === selectedId && guestUniversitySupported(item));
  function choose(choice: UniversityChoice, selection_method: 'quick' | 'search' | 'saved') {
    track('campus_university_selected', { supported: guestUniversitySupported(choice), selection_method });
    onSelect(choice);
  }
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!choice) return;
    choose(choice, !picked && selected?.id === choice.id ? 'saved' : input.trim() ? 'search' : 'quick');
  }
  return <section className="app-guest-university" aria-labelledby="guest-university-title">
    {entryPlan ? <p className="app-guest-university__eyebrow">{entryPlan === 'plus' ? 'CAMPUS PLUS · PRUEBA EL ASISTENTE' : 'CAMPUS FREE · PRUEBA EL ASISTENTE'}</p> : null}
    <h1 id="guest-university-title">Elige tu universidad</h1>
    <p id="guest-university-help">El asistente buscará profesores y cursos de esta universidad. {selected ? 'Cambiar de universidad empieza un chat nuevo.' : 'Puedes cambiarla desde el chat.'}</p>
    <form onSubmit={submit}>
      <label htmlFor="guest-university">Busca tu universidad</label>
      <div className="app-guest-university__search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/lucide.svg#search" /></svg>
        <input id="guest-university" type="search" value={input} onChange={event => { setInput(event.target.value); setSelectedId(null); setError(''); }} placeholder="Nombre, sigla o país" autoComplete="off" aria-describedby="guest-university-help" disabled={loading || !choices.length} />
      </div>
      {loading ? <div className="app-guest-university__loading" role="status" aria-live="polite"><span className="app-sr-only">Cargando universidades…</span><span className="app-skeleton app-skeleton--line" aria-hidden="true" /><span className="app-skeleton app-skeleton--short" aria-hidden="true" /></div> : null}
      {!loading && choices.length ? <>
        <p className="app-guest-university__results-label" role="status">{input.trim() ? `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'}` : 'Disponibles en el chat'}</p>
        {results.length ? <fieldset className="app-guest-university__results">
          <legend className="app-sr-only">Selecciona una universidad</legend>
          {results.map(item => {
            const supported = guestUniversitySupported(item);
            const details = [chatUniversityCode(item) || item.shortName, chatUniversityCountry(item)].filter(Boolean).join(' · ');
            return <label key={item.id} className="app-guest-university__option" data-selected={selectedId === item.id} data-unavailable={!supported}>
              <input type="radio" name="university" value={item.id} checked={selectedId === item.id} disabled={!supported} onChange={() => { setSelectedId(item.id); setPicked(true); }} />
              <span className="app-guest-university__option-text"><strong>{item.name}</strong>{details ? <span>{details}</span> : null}{!supported ? <span className="app-guest-university__unavailable">Aún no disponible en el chat</span> : null}</span>
            </label>;
          })}
        </fieldset> : <div className="app-guest-university__empty"><strong>No encontramos esa universidad</strong><p>Prueba con el nombre completo o la sigla. El chat está disponible para UPC, UPN, Universidad de Palermo y Universidad del Pacífico.</p></div>}
        {results.length && !results.some(guestUniversitySupported) ? <p className="app-guest-university__coverage">Esta universidad está en nuestro catálogo, pero todavía no tiene asistente. Puedes buscar otra universidad disponible.</p> : null}
      </> : null}
      {error ? <p role="alert" className="app-guest-university__error">{error}</p> : null}
      {!loading && !choices.length ? <button type="button" className="app-guest-university__continue" onClick={() => setAttempt(value => value + 1)}>Volver a intentar</button>
        : <button type="submit" className="app-guest-university__continue" disabled={loading || !choice}>Continuar al chat<svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/lucide.svg#arrow-right" /></svg></button>}
    </form>
    <p className="app-guest-university__note">Pruébalo sin crear una cuenta. Elegir universidad no conecta tu Aula Virtual.</p>
    {selected && guestUniversitySupported(selected) ? <button type="button" className="app-guest-university__back" onClick={() => choose(selected, 'saved')}>Volver al asistente de {selected.name}</button> : null}
  </section>;
}
