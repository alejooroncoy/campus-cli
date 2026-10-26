import { selectedPlan, track } from '../scripts/analytics';
import { useEffect, useState, type SubmitEvent } from 'react';
import { chatUniversityCode, guestUniversitySupported, loadUniversityChoices, universityLabel, type UniversityChoice } from '../scripts/guest-university';

export default function GuestUniversity({ selected, onSelect }: {
  selected: UniversityChoice | null; onSelect: (value: UniversityChoice) => void;
}) {
  const [choices, setChoices] = useState<UniversityChoice[]>([]);
  const [input, setInput] = useState(selected ? universityLabel(selected) : '');
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
  const quickChoices = ['UPC', 'UPN', 'UP'].flatMap(code => choices.filter(item => chatUniversityCode(item) === code));
  function choose(choice: UniversityChoice, selection_method: 'quick' | 'search' | 'saved') {
    track('campus_university_selected', { supported: guestUniversitySupported(choice), selection_method });
    onSelect(choice);
  }
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = input.trim().toLocaleLowerCase('es');
    const choice = choices.find(item => chatUniversityCode(item)?.toLocaleLowerCase('es') === query)
      ?? choices.find(item => [universityLabel(item), item.name, item.shortName]
      .some(label => label?.toLocaleLowerCase('es') === query));
    if (!choice) { setError('Elige una universidad de las sugerencias.'); return; }
    choose(choice, 'search');
  }
  return <section className="app-guest-university" aria-labelledby="guest-university-title">
    <span className="app-guest-university__mark" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="/assets/lucide.svg#graduation-cap" /></svg></span>
    <p className="app-guest-university__eyebrow">{entryPlan === 'plus' ? 'CAMPUS PLUS · PRUEBA EL ASISTENTE' : entryPlan === 'free' ? 'CAMPUS FREE · PRUEBA EL ASISTENTE' : 'TU CAMPUS, DESDE EL INICIO'}</p>
    <h1 id="guest-university-title">¿En qué universidad estudias?</h1>
    <p>Elige tu universidad antes de hacer tu primera pregunta. Puedes probar Campus sin crear una cuenta.</p>
    <form onSubmit={submit}>
      {quickChoices.map(choice => <button key={choice.id} type="button" className="app-guest-university__quick" onClick={() => choose(choice, 'quick')}><strong>{chatUniversityCode(choice)}</strong><span>{choice.name}</span><svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/lucide.svg#arrow-right" /></svg></button>)}
      <label htmlFor="guest-university">Busca tu universidad</label>
      <input id="guest-university" list="guest-universities" value={input} onChange={event => { setInput(event.target.value); setError(''); }} placeholder="Escribe el nombre de tu universidad" autoComplete="off" disabled={loading || !choices.length} />
      {loading ? <div className="app-guest-university__loading" role="status" aria-live="polite"><span className="app-sr-only">Cargando universidades…</span><span className="app-skeleton app-skeleton--line" aria-hidden="true" /><span className="app-skeleton app-skeleton--short" aria-hidden="true" /></div> : null}
      <datalist id="guest-universities">{choices.map(item => <option key={item.id} value={universityLabel(item)} />)}</datalist>
      {error ? <p role="alert" className="app-guest-university__error">{error}</p> : null}
      {!loading && !choices.length ? <button type="button" className="app-guest-university__continue" onClick={() => setAttempt(value => value + 1)}>Volver a intentar</button>
        : <button type="submit" className="app-guest-university__continue" disabled={loading || !input.trim()}>Continuar<svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/lucide.svg#arrow-right" /></svg></button>}
    </form>
    <p className="app-guest-university__note">El asistente está disponible para UPC, UPN y Universidad de Palermo. Guardamos tu elección en este navegador y la conservamos al crear tu cuenta.</p>
    {selected && guestUniversitySupported(selected) ? <button type="button" className="app-guest-university__back" onClick={() => choose(selected, 'saved')}>Volver al asistente de {chatUniversityCode(selected)}</button> : null}
  </section>;
}
