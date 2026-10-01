import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify,createHash} from 'node:crypto';
import {createLab,issueLease,validWebhook} from './server.mjs';

test('ephemeral leases are signed, session-bound, test-only and short lived',()=>{
  const {privateKey,publicKey}=generateKeyPairSync('ed25519'),token='a'.repeat(64);
  const lease=issueLease(token,'supporter',privateKey,1000000);
  const bytes=Buffer.from(lease.payload,'base64url');
  assert.ok(verify(null,bytes,publicKey,Buffer.from(lease.signature,'base64url')));
  const claims=JSON.parse(bytes);assert.equal(claims.mode,'test');assert.equal(claims.subject,'isolated-lab-account');
  assert.equal(claims.sessionBinding,createHash('sha256').update(token).digest('hex'));assert.equal(claims.expiresAt,1120);
  assert.equal(JSON.parse(Buffer.from(issueLease(token,'expired',privateKey,1000000).payload,'base64url')).expiresAt,999);
  assert.equal(JSON.parse(Buffer.from(issueLease(token,'supporter',privateKey,1000000,1010000).payload,'base64url')).expiresAt,1010);
});
test('destination validation rejects arbitrary hosts, extra paths and URL secrets',()=>{
  const good='https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrst';
  assert.ok(validWebhook(good));assert.ok(validWebhook(''));
  for(const bad of [good+'?x=1',good+'#x',good+'/more',good.replace('https:','http:'),good.replace('discord.com','localhost'),good.replace('discord.com','user@discord.com')]) assert.equal(validWebhook(bad),false);
});
test('local API isolates synthetic sessions, CSRF, confirmation, expiry and duplicate send',async()=>{
  let sends=0, previews=0, unblock, now=1000000;
  const lab=createLab({port:0,now:()=>now,probe:async(_exe,input)=>{if(input.confirmed){sends++;await new Promise(r=>unblock=r);return{result:'sent'};}
    previews++;assert.ok(!input.confirmed);return {result:'preview',nativeVerified:true,releaseRejectsTest:true,payload:{content:'safe'}};}});
  const base=await lab.start();
  try{
    const index=await fetch(base);const cookie=index.headers.get('set-cookie').split(';')[0];
    const state=await(await fetch(base+'api/state',{headers:{cookie}})).json();
    const headers={cookie,origin:base.slice(0,-1),'content-type':'application/json','x-lab-csrf':state.csrf};
    const post=(route,body,h=headers)=>fetch(base+route,{method:'POST',headers:h,body:JSON.stringify(body)});
    assert.equal((await post('api/prepare',{}, {...headers,origin:'https://evil.invalid'})).status,403);
    assert.equal((await post('api/prepare',{}, {...headers,'x-lab-csrf':'bad'})).status,403);
    assert.equal((await fetch(base+'v1/membership/lease')).status,401);
    assert.equal((await post('api/send',{confirmed:true,confirmationId:'bad'})).status,409);
    const input={webhook:'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrst',locale:'en',mode:'none',roleId:''};
    let prepared=await(await post('api/prepare',input)).json();assert.ok(prepared.confirmationId);assert.equal(sends,0);
    assert.ok(!JSON.stringify(prepared).includes('abcdefghijklmnopqrst'));
    await post('api/fixture',{fixture:'free'});
    assert.equal((await post('api/send',{confirmed:true,confirmationId:prepared.confirmationId})).status,409);
    await post('api/fixture',{fixture:'supporter'});
    assert.equal((await post('api/prepare',{...input,mode:'role',roleId:''})).status,400);
    prepared=await(await post('api/prepare',input)).json();
    const sent=post('api/send',{confirmed:true,confirmationId:prepared.confirmationId});
    while(!unblock) await new Promise(r=>setTimeout(r,5));
    assert.equal((await post('api/send',{confirmed:true,confirmationId:prepared.confirmationId})).status,409);
    assert.equal((await post('api/fixture',{fixture:'free'})).status,409);
    unblock();assert.equal((await sent).status,200);assert.equal(sends,1);assert.equal(previews,2);
    assert.equal((await post('api/send',{confirmed:true,confirmationId:prepared.confirmationId})).status,409);
    const previewOnly=await(await post('api/prepare',{...input,webhook:''})).json();assert.equal(previewOnly.canSend,false);
    await post('api/cancel',{});assert.equal(sends,1);
    const expiring=await(await post('api/prepare',input)).json();
    now+=60000;
    assert.equal((await post('api/send',{confirmed:true,confirmationId:expiring.confirmationId})).status,409);
    now+=15*60*1000;
    assert.equal((await fetch(base+'api/state',{headers:{cookie}})).status,401);assert.equal(sends,1);
  }finally{await lab.stop();}
});
