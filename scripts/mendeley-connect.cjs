// Local OAuth setup. Load client credentials with node --env-file=... .
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const state = crypto.randomBytes(32).toString('hex');
const redirect = process.env.MENDELEY_REDIRECT_URI || 'http://localhost:8765/mendeley/callback';
const target = new URL(redirect);
if (target.hostname !== 'localhost' || target.protocol !== 'http:') throw new Error('Local callback must use http://localhost');
const id = process.env.MENDELEY_CLIENT_ID, secret = process.env.MENDELEY_CLIENT_SECRET;
if (!id || !secret) throw new Error('Mendeley client credentials required');
const tokenFile = process.env.MENDELEY_TOKEN_FILE || path.join(os.homedir(), '.campus-cli', 'mendeley-tokens.json');
let busy = false;
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const u = new URL(req.url, redirect);
  if (req.method !== 'GET' || u.pathname !== target.pathname) { res.writeHead(404).end(); return; }
  if (u.searchParams.get('state') !== state || !u.searchParams.get('code') || busy) { res.writeHead(400).end('Invalid OAuth callback'); return; }
  busy = true;
  try {
    const r = await fetch('https://api.mendeley.com/oauth/token', { method:'POST', redirect:'error', signal:AbortSignal.timeout(20000), headers:{Authorization:'Basic '+Buffer.from(id+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({grant_type:'authorization_code',code:u.searchParams.get('code'),redirect_uri:redirect}) });
    if (!r.ok) throw new Error('OAuth HTTP '+r.status);
    const t = await r.json();
    if (!t.access_token || !t.refresh_token) throw new Error('Incomplete OAuth response');
    const data = {access_token:t.access_token,refresh_token:t.refresh_token,expires_at:Date.now()+t.expires_in*1000};
    fs.mkdirSync(path.dirname(tokenFile),{recursive:true,mode:0o700});
    const tmp=tokenFile+'.'+crypto.randomUUID()+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600,flag:'wx'}); fs.renameSync(tmp,tokenFile);
    res.end('Mendeley conectado a Campus. Puedes cerrar esta pestana.');
    console.log('Mendeley connected; tokens saved privately.');
    clearTimeout(timer); server.close();
  } catch { res.writeHead(502).end('No se pudo conectar Mendeley. Reinicia la conexion.'); console.error('Mendeley OAuth failed; no credentials logged.'); clearTimeout(timer);server.close(); }
});
const timer=setTimeout(()=>server.close(),600000);
server.listen(Number(target.port||80),'127.0.0.1',()=>{
  const url = new URL('https://api.mendeley.com/oauth/authorize');
  for(const [k,v] of Object.entries({client_id:id,response_type:'code',scope:'all',redirect_uri:redirect,state})) url.searchParams.set(k,v);
  console.log(url.toString());
});
