export function assistantReturnPath(value:string|null){
 return value && /^\/app\/profes(?:\/c\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\/$/i.test(value)?value:null;
}
export function connectAiHref(path:string){
 const back=assistantReturnPath(path);
 return back?`/app/copilot/?return=${encodeURIComponent(back)}`:'/app/copilot/';
}
