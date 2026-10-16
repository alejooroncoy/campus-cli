import { selectedPlan, track } from '../scripts/analytics';
import { useEffect, useState, type SubmitEvent } from 'react';
import { guestUniversitySupported, loadUniversityChoices, universityLabel, type UniversityChoice } from '../scripts/guest-university';

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
  const upc = choices.find(item => item.shortName === 'UPC');
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = input.trim().toLocaleLowerCase('es');
    const choice = choices.find(item => [universityLabel(item), item.name, item.shortName]
      .some(label => label?.toLocaleLowerCase('es') === query));
    if (!choice) { setError('Elige una universidad de las sugerencias.'); return; }
    track('campus_university_selected', { supported: guestUniversitySupported(choice) });
    onSelect(choice);
  }
  return <section className="app-guest-university" aria-labelledby="guest-university-title">
    <span className="app-guest-university__mark" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="/assets/lucide.svg#graduation-cap" /></svg></span>
    <p className="app-guest-university__eyebrow">{entryPlan === 'plus' ? 'CAMPUS PLUS · PRUEBA EL ASISTENTE' : entryPlan === 'free' ? 'CAMPUS FREE · PRUEBA EL ASISTENTE' : 'TU CAMPUS, DESDE EL INICIO'}</p>
    <h1 id="guest-university-title">¿En qué universidad estudias?</h1>
    <p>Elige tu universidad antes de hacer tu primera pregunta. Puedes probar Campus sin crear una cuenta.</p>
    <form onSubmit={submit}>
      {upc ? <button type="button" className="app-guest-university__quick" onClick={() => { setInput(universityLabel(upc)); setError(''); }} aria-pressed={input === universityLabel(upc)}><strong>UPC</strong><span>Universidad Peruana de Ciencias Aplicadas</span><svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/lucide.svg#check" /></svg></button> : null}
      <label htmlFor="guest-university">Busca tu universidad</label>
      <input id="guest-university" list="guest-universities" value={input} onChange={event => { setInput(event.target.value); setError(''); }} placeholder={loading ? 'Cargando universidades…' : 'Escribe el nombre de tu universidad'} autoComplete="off" disabled={loading || !choices.length} />
      <datalist id="guest-universities">{choices.map(item => <option key={item.id} value={universityLabel(item)} />)}</datalist>
      {error ? <p role="alert" className="app-guest-university__error">{error}</p> : null}
      {!loading && !choices.length ? <button type="button" className="app-guest-university__continue" onClick={() => setAttempt(value => value + 1)}>Volver a intentar</button>
        : <button type="submit" className="app-guest-university__continue" disabled={loading || !input.trim()}>Continuar<svg viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/lucide.svg#arrow-right" /></svg></button>}
    </form>
    <p className="app-guest-university__note">Por ahora, el asistente está disponible para UPC. Guardamos tu elección en este navegador y la conservamos al crear tu cuenta.</p>
    {selected && guestUniversitySupported(selected) ? <button type="button" className="app-guest-university__back" onClick={() => onSelect(selected)}>Volver al asistente de UPC</button> : null}
  </section>;
}
