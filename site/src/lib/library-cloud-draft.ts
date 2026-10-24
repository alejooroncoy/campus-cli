export type CloudFile = { id:string; name:string; mime:string; size:number };
export type CloudCopy<T> = { scope:string; revision:number; mutationId:string|null; updatedAt:string|null; snapshot:T|null; files:CloudFile[] };
export type CloudAttempt<T> = { revision:number; mutationId:string; snapshot:T|null; files?:File[] };
// One in-flight write per editor. A lost response retries the same mutation before
// sending newer edits; omitted files retain the previously uploaded selection.
export class CloudDraftQueue<T> {
  revision:number;
  paused=false;
  private latest: {snapshot:T|null;files?:File[]}|null=null;
  private attempt:CloudAttempt<T>|null=null;
  private running:Promise<void>|null=null;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private started=0;
  constructor(revision:number,privateSend:(attempt:CloudAttempt<T>)=>Promise<CloudCopy<T>>,privateHooks:{before:()=>void;saved:(copy:CloudCopy<T>)=>void;failed:(error:unknown)=>void}) {
    this.revision=revision;this.send=privateSend;this.hooks=privateHooks;
  }
  private send:(attempt:CloudAttempt<T>)=>Promise<CloudCopy<T>>;
  private hooks:{before:()=>void;saved:(copy:CloudCopy<T>)=>void;failed:(error:unknown)=>void};
  get dirty(){return !!this.latest || !!this.attempt;}
  get mutationId(){return this.attempt?.mutationId;}
  update(snapshot:T|null,files?:File[]){
    this.latest={snapshot,files:files ?? this.latest?.files};
    this.schedule();
  }
  private schedule(){
    clearTimeout(this.timer);
    if(this.paused)return;
    this.timer=setTimeout(()=>{void this.flush().catch(()=>{});},Math.max(800,2500-(Date.now()-this.started)));
  }
  async flush():Promise<void>{
    clearTimeout(this.timer);
    if(this.paused)throw new Error('Resuelve el conflicto de borradores antes de continuar.');
    if(this.running){await this.running;if(this.dirty)return this.flush();return;}
    if(!this.attempt && this.latest){this.attempt={revision:this.revision,mutationId:crypto.randomUUID(),...this.latest};this.latest=null;}
    if(!this.attempt)return;
    const attempt=this.attempt;this.started=Date.now();
    this.hooks.before();
    this.running=(async()=>{
      try{const copy=await this.send(attempt);this.revision=copy.revision;this.attempt=null;this.hooks.saved(copy);}
      catch(error){
        const status = (error as {status?:number})?.status;
        if(status===400 || status===413){
          this.latest=this.latest ? {...this.latest,files:this.latest.files ?? attempt.files} : {snapshot:attempt.snapshot,files:attempt.files};
          this.attempt=null;
        }
        this.hooks.failed(error);throw error;
      }
    })();
    try{await this.running;}finally{this.running=null;}
    if(this.latest) return this.flush();
  }
  rebase(revision:number){
    clearTimeout(this.timer);
    if(this.running)throw new Error('Espera a que termine la sincronización.');
    const fallback=this.attempt;
    this.latest=this.latest ? {...this.latest,files:this.latest.files ?? fallback?.files} : fallback ? {snapshot:fallback.snapshot,files:fallback.files} : null;
    this.attempt=null;this.revision=revision;this.paused=false;
  }
  async discard(){this.update(null,[]);await this.flush();}
}
export function chooseCloudRecovery(local:{cloudRevision?:number;cloudMutation?:string;cloudDirty?:boolean;cloudDiscarded?:boolean}|null,remote:{revision:number;mutationId:string|null}) {
  if(!local)return 'remote' as const;
  if(local.cloudDiscarded)return remote.revision===(local.cloudRevision ?? 0) || (!!local.cloudMutation && local.cloudMutation===remote.mutationId) ? 'discard' as const : 'remote' as const;
  if(remote.revision < (local.cloudRevision ?? 0))return 'conflict' as const;
  if(remote.revision===(local.cloudRevision ?? 0) || (!!local.cloudMutation && local.cloudMutation===remote.mutationId))return 'local' as const;
  return local.cloudDirty===false ? 'remote' as const : 'conflict' as const;
}
