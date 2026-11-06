// One-time additive setup. Secrets are passed to Vercel on stdin, never printed.
import postgres from 'postgres';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const apply=process.argv.includes('--apply'),configure=process.argv.includes('--configure-vercel');
if(apply&&(!configure||!process.env.CAMPUS_UCAL_KEY_BACKUP_PATH))throw Error('Pass --configure-vercel and a private CAMPUS_UCAL_KEY_BACKUP_PATH with --apply.');
const root=fileURLToPath(new URL('../../',import.meta.url));
if(apply){const project=JSON.parse(await readFile(new URL('../../.vercel/project.json',import.meta.url),'utf8'));if(project.projectId!=='prj_CkhlyuZVXCUt84OO6fMZ1EIaQNH0')throw Error('Unexpected Vercel project.');}
const raw=process.env.CAMPUS_UCAL_ADMIN_DATABASE_URL??process.env.DATABASE_URL_UNPOOLED??process.env.DATABASE_URL;
if(!raw)throw Error('Configure the authorized administrative database connection.');
const url=new URL(raw);url.hostname=url.hostname.replace('-pooler.','.');
const sql=postgres(url.toString(),{max:1,prepare:false,connect_timeout:8,onnotice:()=>{}});
try{
  const [state]=await sql`select current_database() as database,to_regclass('campus_growth.ucal_waitlist') as registry,exists(select 1 from pg_roles where rolname='campus_ucal_writer') as writer_exists`;
  console.log({mode:apply?'apply':'inspect',database:state.database,registryPresent:state.registry!==null,writerExists:state.writer_exists});
  if(apply){
    if(state.writer_exists)throw Error('The writer already exists. Inspect deployed configuration before changing credentials.');
    const password=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex');
    await writeFile(process.env.CAMPUS_UCAL_KEY_BACKUP_PATH,`CAMPUS_UCAL_SECRET=${secret}\n`,{mode:0o600,flag:'wx'});
    await sql.unsafe(await readFile(new URL('../sql/ucal-waitlist.sql',import.meta.url),'utf8'));
    await sql.begin(async tx=>{
      await tx.unsafe(`create role campus_ucal_writer login noinherit password '${password}'`);
      await tx.unsafe('grant usage on schema campus_growth to campus_ucal_writer; grant execute on function campus_growth.request_ucal(text,text,text,text,uuid),campus_growth.ucal_confirmation_delivery(uuid,uuid,boolean),campus_growth.confirm_ucal(text),campus_growth.remove_ucal(uuid) to campus_ucal_writer');
    });
    const [permissions]=await sql`select has_table_privilege('campus_ucal_writer','campus_growth.ucal_waitlist','SELECT') as can_read,has_table_privilege('campus_ucal_writer','campus_growth.ucal_waitlist','DELETE') as can_delete`;
    if(permissions.can_read||permissions.can_delete)throw Error('Invalid writer grants');
    const writerUrl=new URL(raw);writerUrl.username='campus_ucal_writer';writerUrl.password=password;
    if(writerUrl.hostname.endsWith('.neon.tech')&&!writerUrl.hostname.includes('-pooler.'))writerUrl.hostname=writerUrl.hostname.replace('.','-pooler.');
    const writer=postgres(writerUrl.toString(),{max:1,prepare:false,connect_timeout:8,onnotice:()=>{}});
    try{const [row]=await writer`select current_user as role`;if(row.role!=='campus_ucal_writer')throw Error('Writer connection did not verify');}finally{await writer.end({timeout:5});}
    for(const [name,value] of [['CAMPUS_UCAL_DATABASE_URL',writerUrl.toString()],['CAMPUS_UCAL_SECRET',secret]]){
      const result=spawnSync('vercel',['env','add',name,'production','--sensitive','--yes'],{cwd:root,input:value+'\n',encoding:'utf8',stdio:['pipe','pipe','pipe']});
      if(result.status!==0)throw Error('Environment configuration did not complete. Inspect existing Vercel variable names before retrying.');
      console.log({configured:name});
    }
    console.log({applied:true,restrictedWriter:true});
  }
}catch(error){console.error(error instanceof Error&&/^(The writer|Provisioning|Environment|Invalid writer)/.test(error.message)?error.message:'UCAL provisioning failed. No credentials or provider responses were printed.');process.exitCode=1;}
finally{await sql.end({timeout:5});}
