export function assistantReturnPath(value:string|null){
 return value && /^\/app\/(?:profes|asistente)(?:\/c\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\/(?:\?modal=review)?$/i.test(value)?value:null;
}
export function connectAiHref(path:string){
 const back=assistantReturnPath(path);
 return back?`/app/copilot/?return=${encodeURIComponent(back)}`:'/app/copilot/';
}

export function assistantLoginHref(path:string, search?: string){
 const modalParam = search && new URLSearchParams(search).get('modal') === 'review' ? '?modal=review' : '';
 const candidate = path.includes('?') ? path : `${path}${modalParam}`;
 const back = assistantReturnPath(candidate) ?? assistantReturnPath(path) ?? '/app/asistente/';
 const normalized = back.replace(/^\/app\/profes/, '/app/asistente');
 return `/api/app/auth/start?return=${encodeURIComponent(normalized)}`;
}
