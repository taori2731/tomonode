import http from 'node:http';
import { randomBytes, generateKeyPairSync, createHash, sign, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const assets = { '/': ['index.html','text/html'], '/client.js':['client.js','text/javascript'], '/style.css':['style.css','text/css'] };
const locales = ['ja','en','zh-CN','zh-TW','ko','es','de','fr','pt-BR'];
const hex = () => randomBytes(32).toString('hex');
const eq = (a,b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b));

export function validWebhook(value) {
  if (!value) return true; // preview without any destination is safe
  if (typeof value !== 'string' || value.length > 512) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'discord.com' && !u.port && !u.username && !u.password && !u.search && !u.hash
      && /^\/api(?:\/v10)?\/webhooks\/\d{17,22}\/[A-Za-z0-9_-]{20,200}$/.test(u.pathname);
  } catch { return false; }
}

export function issueLease(token, fixture, privateKey, now = Date.now(), sessionUntil = now + 120_000) {
  const t = Math.floor(now/1000);
  const claims = { audience:'tomonode-desktop', subject:'isolated-lab-account', sessionBinding:createHash('sha256').update(token).digest('hex'),
    plan:'supporter', mode:'test', issuedAt:t-1, expiresAt:fixture === 'expired' ? t-1 : Math.min(t+120,Math.floor(sessionUntil/1000)),
    paidUntil:t+180, cancelAtPeriodEnd:false };
  const message = Buffer.from(JSON.stringify(claims));
  return {payload:message.toString('base64url'),signature:sign(null,message,privateKey).toString('base64url'),keyId:'isolated-lab-v1'};
}

export async function nativeProbe(executable, input) {
  return new Promise(resolve => {
    const child = spawn(executable,['supporter_lab::isolated_native_probe','--exact','--ignored','--nocapture','--test-threads=1'],
      {cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true});
    let output = '', settled = false;
    const finish = result => { if (!settled) { settled=true; clearTimeout(timer); resolve(result); } };
    const timer = setTimeout(() => { child.kill(); finish({result:'native_timeout'}); },110_000);
    child.stdout.on('data',chunk => { if (output.length < 32768) output += chunk.toString(); });
    child.stderr.resume(); // Don't leak provider/transport errors or secrets into logs.
    child.on('error',() => finish({result:'native_unavailable'}));
    child.on('close',code => {
      const match = output.match(/TOMONODE_LAB_RESULT:(\{[^\r\n]*\})/);
      try { finish(code === 0 && match ? JSON.parse(match[1]) : {result:'native_failed'}); }
      catch { finish({result:'native_failed'}); }
    });
    child.stdin.on('error',() => {});
    child.stdin.end(JSON.stringify(input)); // Secrets are stdin only, never argv/env/files.
  });
}

export async function compileProbe() {
  return new Promise((resolve,reject) => {
    const child=spawn('cargo',['test','--locked','--manifest-path','src-tauri/Cargo.toml','--lib','--no-run','--message-format=json'],
      {cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});
    let output='', executable='';
    child.stdout.on('data',c=>{ output+=c.toString(); const lines=output.split('\n'); output=lines.pop();
      for(const line of lines) { try { const v=JSON.parse(line); if(v.reason==='compiler-artifact' && v.profile?.test && v.executable && v.target?.name==='minecraft_server_hub_lib') executable=v.executable; } catch{} }
    });
    child.stderr.on('data',c=>process.stderr.write(c)); // Build has no runtime credentials.
    child.on('error',reject); child.on('close',code=>code===0 && executable ? resolve(executable) : reject(Error('Native test build failed')));
  });
}

export function createLab({executable, probe=nativeProbe, port=1466, now=Date.now}={}) {
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const pin={keyId:'isolated-lab-v1',publicKey:publicKey.export({format:'jwk'}).x};
  const clients=new Map();
  let base='';
  function json(res,body,status=200) { res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'}); res.end(JSON.stringify(body)); }
  function client(req) { const id=req.headers.cookie?.match(/(?:^|; )lab=([a-f0-9]{64})(?:;|$)/)?.[1];
    const value=clients.get(id); if(!value || value.until<=now()) { if(value) clients.delete(id); return null; } return value; }
  async function body(req) { let bytes=0, chunks=[]; for await(const c of req){ bytes+=c.length; if(bytes>4096) throw Error('size'); chunks.push(c); } return JSON.parse(Buffer.concat(chunks)); }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('x-content-type-options','nosniff'); res.setHeader('referrer-policy','no-referrer');
    res.setHeader('content-security-policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    res.setHeader('cache-control','no-store');
    if(req.headers.host!==new URL(base).host) return json(res,{error:'BAD_HOST'},403);
    try {
      if(req.method==='GET' && assets[req.url]) {
        if(req.url==='/') {
          if(!client(req)) { if(clients.size>=8) return json(res,{error:'CAPACITY'},429);
            const id=hex(); clients.set(id,{csrf:hex(),token:hex(),fixture:'supporter',pending:null,busy:false,until:now()+15*60_000});
            res.setHeader('set-cookie',`lab=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=900`); }
        }
        const [file,mime]=assets[req.url]; res.setHeader('content-type',`${mime}; charset=utf-8`); return res.end(await readFile(new URL(file,import.meta.url)));
      }
      if(req.url==='/v1/membership/lease' && req.method==='GET') {
        const token=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
        const c=[...clients.values()].find(c=>c.until>now() && eq(token,c.token));
        if(!c) return json(res,{state:'session_expired'},401);
        if(c.fixture==='free') return json(res,{state:'free'},403);
        return json(res,issueLease(c.token,c.fixture,privateKey,now(),c.until));
      }
      const c=client(req); if(!c) return json(res,{error:'SESSION_EXPIRED'},401);
      if(req.url==='/api/state' && req.method==='GET') return json(res,{csrf:c.csrf,fixture:c.fixture,busy:c.busy});
      if(req.method!=='POST' || req.headers.origin!==base.slice(0,-1) || !eq(req.headers['x-lab-csrf'],c.csrf) || req.headers['content-type']!=='application/json') return json(res,{error:'FORBIDDEN'},403);
      if(c.busy) return json(res,{error:'BUSY'},409);
      const input=await body(req);
      if(req.url==='/api/fixture') {
        if(!['supporter','free','expired'].includes(input.fixture)) return json(res,{error:'INVALID_FIXTURE'},400);
        c.fixture=input.fixture; c.token=hex(); c.pending=null; return json(res,{fixture:c.fixture});
      }
      if(req.url==='/api/prepare') {
        c.pending=null;
        if(!validWebhook(input.webhook) || !locales.includes(input.locale) || !['none','role','here','everyone'].includes(input.mode)
          || (input.mode==='role' && !/^\d{17,22}$/.test(input.roleId??''))) return json(res,{error:'INVALID_SETTINGS'},400);
        const mentions={enabled:input.mode!=='none',mode:input.mode==='none'?'everyone':input.mode,roleId:input.mode==='role'?input.roleId:''};
        const request={apiBase:base,pin,token:c.token,webhook:input.webhook||'',locale:input.locale,mentions,confirmed:false};
        c.busy=true;
        let result; try { result=await probe(executable,request); } finally {c.busy=false;}
        if(result.result==='preview' && request.webhook) { const id=hex(); c.pending={id,request,until:now()+60_000};
          return json(res,{...result,confirmationId:id,canSend:true}); }
        return json(res,{...result,canSend:false});
      }
      if(req.url==='/api/send') {
        const pending=c.pending; c.pending=null; // consume before any HTTP; duplicate clicks cannot post twice
        if(input.confirmed!==true || !pending || pending.until<=now() || !eq(input.confirmationId,pending.id)) return json(res,{error:'CONFIRMATION_REQUIRED'},409);
        c.busy=true;
        try {return json(res,await probe(executable,{...pending.request,confirmed:true}));} finally { c.busy=false; pending.request.webhook=''; }
      }
      if(req.url==='/api/cancel') { c.pending=null; return json(res,{result:'cancelled'}); }
      return json(res,{error:'NOT_FOUND'},404);
    } catch { return json(res,{error:'REQUEST_FAILED'},400); }
  });
  const timer=setInterval(()=>{for(const [id,c] of clients) {if(c.until<=now()) clients.delete(id); else if(c.pending && c.pending.until<=now()) c.pending=null;}},10_000);
  timer.unref(); server.on('close',()=>{clearInterval(timer);clients.clear();});
  return {server,pin,start:()=>new Promise(resolve=>server.listen(port,'127.0.0.1',()=>{base=`http://127.0.0.1:${server.address().port}/`;resolve(base);})),stop:()=>new Promise(resolve=>server.close(resolve))};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const executable=await compileProbe(); const lab=createLab({executable});
  console.log(`Isolated TomoNode lab: ${await lab.start()} (synthetic sessions, RAM-only secrets; no production account/billing)`);
  const stop=()=>lab.stop().then(()=>process.exit()); process.on('SIGINT',stop); process.on('SIGTERM',stop);
}
