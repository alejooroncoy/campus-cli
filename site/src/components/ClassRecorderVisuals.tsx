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
      <source media="(prefers-reduced-motion: reduce)" srcSet={paused ? '/assets/campu/campito-paused-v1-320.webp' : '/assets/campu/campito-listening-still-v1-320.webp'} />
      <img src={paused ? '/assets/campu/campito-paused-v1-320.webp' : '/assets/campu/campito-listening-v2-320.webp'} width={size} height={size} alt="" decoding="async" />
    </picture>
  </span>;
}

/** Barras de nivel con la historia reciente del micrófono: se ve que el sonido entra, no la precisión del texto. */
export function LevelBars({ level, active, bars = 28 }: { level: number; active: boolean; bars?: number }) {
  const [history, setHistory] = useState<number[]>(() => Array(bars).fill(0));
  const last = useRef(0);
  useEffect(() => {
    if (!active) return;
    const now = performance.now();
    if (now - last.current < 110) return;
    last.current = now;
    setHistory(h => [...h.slice(1), Math.min(1, Math.max(0, level))]);
  }, [level, active]);
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
