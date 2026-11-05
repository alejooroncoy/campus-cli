import {useRef, useState} from 'react';
import {CHARACTER_NAME} from '../lib/character.mjs';

const pose = '/assets/campu/campu-wave-v2-192.webp';
const poseSet = `${pose} 192w, /assets/campu/campu-wave-v2-480.webp 480w`;

export default function CharacterGreeting({size = 176, className = ''}: {size?: number; className?: string}) {
  const loaded = useRef(new Set<string>());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  function onLoad(part: string) {
    loaded.current.add(part);
    if (loaded.current.size === 4) setReady(true);
  }
  return <span className={`character-greeting ${className}`} style={{width:size}}
    role="img" aria-label={`${CHARACTER_NAME} saludando`} data-character-greeting data-ready={ready && !failed}>
    <img className="character-greeting__fallback" src={pose} srcSet={poseSet} sizes={`${size}px`} width={size} height={size} alt="" />
    <span className="character-greeting__layers" aria-hidden="true">
      <img className="character-greeting__body" src="/assets/campu/campu-body-v3-192.webp"
        srcSet="/assets/campu/campu-body-v3-192.webp 192w, /assets/campu/campu-body-v3-480.webp 480w"
        sizes={`${size}px`} width={size} height={size} alt="" onLoad={() => onLoad('body')} onError={() => setFailed(true)} />
      {['left', 'right', 'arm'].map(part => <img key={part} className={`character-greeting__${part}`}
        src={pose} srcSet={poseSet} sizes={`${size}px`} width={size} height={size} alt=""
        onLoad={() => onLoad(part)} onError={() => setFailed(true)} />)}
    </span>
  </span>;
}
