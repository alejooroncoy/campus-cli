export function assistantReturnPath(value:string|null){
 return value && /^\/app\/(?:profes|asistente)(?:\/c\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\/$/i.test(value)?value:null;
}
export function connectAiHref(path:string){
 const back=assistantReturnPath(path);
 return back?`/app/copilot/?return=${encodeURIComponent(back)}`:'/app/copilot/';
}

export function assistantLoginHref(path:string, search?: string){
 const back=assistantReturnPath(path) ?? '/app/asistente/';
 const normalized=back.replace(/^\/app\/profes/, '/app/asistente');
 const modalParam = search && new URLSearchParams(search).get('modal') === 'review' ? '?modal=review' : '';
 return `/api/app/auth/start?return=${encodeURIComponent(`${normalized}${modalParam}`)}`;
}
