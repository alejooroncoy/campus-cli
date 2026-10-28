export type KeepBothOperation = {id:string; signature:string};
// Retry identity follows actual content, not device clocks, editor steps or stale
// work pointers. Persist it before sending so reopening after a lost reply is safe.
export async function keepBothOperation(snapshot:{fields:Record<string,string>;criteria:Record<string,string>[]},files:File[],previous?:KeepBothOperation):Promise<KeepBothOperation> {
  const digest=async(bytes:BufferSource)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const content={fields:snapshot.fields,criteria:snapshot.criteria,files:await Promise.all(files.map(async file=>({name:file.name,hash:await digest(await file.arrayBuffer())})))};
  const signature=await digest(new TextEncoder().encode(JSON.stringify(content)));
  return previous?.signature===signature ? previous : {id:crypto.randomUUID(),signature};
}
