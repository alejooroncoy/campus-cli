// Local-only UI fixture. No real sender or production database is used.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {handleUcalWaitlist} from '../api/ucal-waitlist.js';
const root=resolve(new URL('../dist',import.meta.url).pathname),rows=new Map();let lastToken='';
const store={async request(value){let row=rows.get(value.emailKey);if(row?.sent)return {outcome:'accepted',signup_id:row.id};row={id:randomUUID(),...value};rows.set(value.emailKey,row);return {outcome:'send',signup_id:row.id};},async delivery(id,lease,sent){for(const row of rows.values())if(row.id===id)row.sent=sent;return true;},async confirm(hash){for(const row of rows.values())if(row.hash===hash){row.confirmed=true;return true;}return false;},async remove(id){for(const [key,row]of rows)if(row.id===id)rows.delete(key);}};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:4876');
 if(url.pathname==='/__waitlist-fixture'){res.setHeader('content-type','application/json');res.end(JSON.stringify({confirm:`http://127.0.0.1:4876/ucal/avisos/?action=confirm&token=${lastToken}`,confirmed:[...rows.values()].filter(r=>r.confirmed).length}));return;}
 if(url.pathname==='/api/ucal-waitlist'){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const request=new Request(url,{method:req.method,headers:{...req.headers,'x-vercel-forwarded-for':'203.0.113.5'},body:Buffer.concat(chunks)});
  const response=await handleUcalWaitlist(request,{env:{CAMPUS_UCAL_SECRET:'11'.repeat(32),RESEND_API_KEY:'fixture-only'},store,send:async mail=>{lastToken=mail.text.match(/action=confirm&token=([A-Za-z0-9_-]{43})/)?.[1]??'';}});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
 }
 try{const filename=resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));if(!filename.startsWith(root+sep))throw Error();const data=await readFile(filename);const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'}[extname(filename)]??'application/octet-stream';res.writeHead(200,{'content-type':type});res.end(data);}
 catch{res.writeHead(404);res.end('Not found');}
});
server.listen(4876,'127.0.0.1',()=>console.log('Synthetic waitlist fixture: http://127.0.0.1:4876/upc-compra-ucal/'));
