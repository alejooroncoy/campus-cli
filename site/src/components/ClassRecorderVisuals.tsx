// Piezas visuales de Mis clases. Solo presentación: reciben el estado que ya calcula ClassRecorder
// y no cambian cómo se graba, guarda o transcribe.
import { useEffect, useRef, useState } from 'react';
import CharacterGreeting from './CharacterGreeting';
import { CHARACTER_NAME } from '../lib/character.mjs';

/** Loop de escucha: sentado, parpadea y mira su cuaderno. Pausa y movimiento reducido usan una pose fija. */
export function CampitoListening({ level, paused = false, native = false, size = 112 }: { level: number; paused?: boolean; native?: boolean; size?: number }) {
  const intensity = paused || native ? 0 : Math.min(1, Math.max(0, level));
  return <span className="classes-listener" data-paused={paused} data-native={native} style={{ width: size, height: size, ['--level' as string]: intensity.toFixed(2) }}
    role="img" aria-label={paused ? `${CHARACTER_NAME} en pausa` : `${CHARACTER_NAME} escuchando la clase`}>
    <span className="classes-listener__halo" aria-hidden="true" />
    <picture className="classes-listener__pose" aria-hidden="true">
      <source media="(prefers-reduced-motion: reduce)" srcSet={paused ? '/assets/campu/campito-paused-v1-320.webp' : '/assets/campu/campito-listening-still-v2-256.webp'} />
      <img src={paused ? '/assets/campu/campito-paused-v1-320.webp' : '/assets/campu/campito-listening-v3-256.webp'} width={size} height={size} alt="" decoding="async" />
    </picture>
  </span>;
}

/** Barras de nivel con la historia reciente del micrófono: se ve que el sonido entra, no la precisión del texto. */
export function LevelBars({ level, active, bars = 28 }: { level: number; active: boolean; bars?: number }) {
  const [history, setHistory] = useState<number[]>(() => Array(bars).fill(0));
  const latest = useRef(level);
  latest.current = level;
  // Avanza a ritmo fijo aunque el nivel no cambie: el silencio también debe verse pasar.
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setHistory(h => [...h.slice(1), Math.min(1, Math.max(0, latest.current))]), 110);
    return () => window.clearInterval(timer);
  }, [active]);
  return <span className="classes-levelbars" aria-hidden="true" data-active={active}>
    {history.map((v, i) => <i key={i} style={{ ['--h' as string]: (0.12 + v * 0.88).toFixed(2) }} />)}
  </span>;
}

const STEPS: { key: string; label: string }[] = [
  { key: 'upload', label: 'Audio en tu cuenta' },
  { key: 'transcribe', label: 'Transcribiendo en español' },
  { key: 'ready', label: 'Texto listo para repasar' },
];
/** Progreso de una clase después de grabar, derivado solo de su estado. */
export function TranscriptionSteps({ status }: { status?: string }) {
  const at = status === 'ready' ? 3 : status === 'processing' ? 1 : status === 'queued' ? 1 : status === 'draft' ? 0 : -1;
  if (at < 0 || at >= 3) return null;
  return <div className="classes-steps" role="status" aria-label="Progreso de la transcripción">
    <img src="/assets/campu/campu-body-v3-192.webp" width="40" height="40" alt="" aria-hidden="true" />
    <ol>
      {STEPS.map((step, i) => <li key={step.key} data-state={i < at ? 'done' : i === at ? 'current' : 'next'}>
        <span aria-hidden="true" />{step.label}{i === at && status === 'queued' ? ' · en cola' : ''}
      </li>)}
    </ol>
  </div>;
}

/** Primera vez: Campito saluda y deja claro el siguiente paso. */
export function EmptyClasses() {
  return <div className="classes-empty">
    <CharacterGreeting size={96} className="classes-empty__campito" />
    <strong>Tu próxima clase empieza aquí.</strong>
    <p>Graba una clase o sube un audio. {CHARACTER_NAME} la transcribe para que la repases cuando quieras.</p>
  </div>;
}

const PREVIEW_BARS = [.3, .55, .8, .45, .9, .6, .35, .7, 1, .5, .65, .4, .85, .55, .3, .6, .75, .45, .9, .5, .35, .65, .8, .4];
const SIGNED_OUT_BENEFITS: { icon: string; title: string; text: string }[] = [
  { icon: 'mic', title: 'Graba desde tu celular', text: 'Eliges el curso y dejas grabando.' },
  { icon: 'text', title: 'Recibe el texto en español', text: `${CHARACTER_NAME} la transcribe para que repases.` },
  { icon: 'lock', title: 'Solo en tu cuenta', text: 'Separadas de otras cuentas.' },
];
function BenefitIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v2',
    text: 'M5 6h14M5 10h14M5 14h9M5 18h6',
    lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
  };
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

/** Sin sesión: muestra cómo se ve una clase lista antes de pedir el inicio de sesión. */
export function SignedOutClasses({ message }: { message?: string }) {
  // El inicio de sesión pasa por varias redirecciones y tarda unos segundos: el botón lo dice al instante.
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => { if (e.persisted) setOpening(false); };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);
  return <section className="classes-signedout" aria-labelledby="classes-signedout-title">
    <div className="classes-signedout__stage" aria-hidden="true">
      <img className="classes-signedout__campito" src="/assets/campu/campito-listening-still-v2-256.webp" width="112" height="112" alt="" decoding="async" />
      <div className="classes-signedout__preview">
        <div className="classes-signedout__row"><strong>Clase de ejemplo</strong><span className="classes-signedout__badge">Texto listo</span></div>
        <span className="classes-signedout__meta">Lunes · 1 h 32 min</span>
        <span className="classes-signedout__wave">{PREVIEW_BARS.map((h, i) => <i key={i} style={{ ['--h' as string]: h }} />)}</span>
        <ul>
          <li><span>12:04</span><p>Lo importante para el examen es entender el porqué, no solo la fórmula.</p></li>
        </ul>
      </div>
    </div>
    <div className="classes-signedout__body">
      <h2 id="classes-signedout-title">Tus clases, en texto para repasar.</h2>
      {message && <p className="classes-signedout__message" role="status">{message}</p>}
      <ul className="classes-signedout__benefits">
        {SIGNED_OUT_BENEFITS.map(b => <li key={b.icon}><span className="classes-signedout__icon"><BenefitIcon name={b.icon} /></span><span><strong>{b.title}</strong><small>{b.text}</small></span></li>)}
      </ul>
      <div className="classes-signedout__cta-bar"><a className="app-button classes-signedout__cta" href="/api/app/auth/start?return=/app/clases/" aria-busy={opening} data-opening={opening} onClick={() => setOpening(true)}>{opening ? <><span className="classes-signedout__spinner" aria-hidden="true" />Abriendo inicio de sesión…</> : 'Iniciar sesión'}</a></div>
    </div>
  </section>;
}
