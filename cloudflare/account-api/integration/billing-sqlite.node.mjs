import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import Stripe from "stripe";
import { handleBilling, validPrice, validPortalConfiguration, billingConfigured, stripeDestination, verifiedPaidUntil, processBillingEvent, reconcileAccountBilling } from "../src/billing.ts";
import { fetchHandler } from "../src/worker.ts";

class SqliteD1 {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys=ON");
    for (const name of ["0001_initial", "0002_password_auth", "0003_browser_auth", "0004_email_change_and_identity", "0005_billing"]) {
      this.sqlite.exec(readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), "utf8"));
    }
  }
  prepare(sql) {
    let args = [];
    const s = { bind: (...values) => { args=values; return s; },
      first: async () => this.sqlite.prepare(sql).get(...args) ?? null,
      all: async () => ({ success: true, results: this.sqlite.prepare(sql).all(...args) }),
      run: async () => ({ success: true, meta: { changes: Number(this.sqlite.prepare(sql).run(...args).changes) } }) };
    return s;
  }
  async batch(statements) {
    this.sqlite.exec("BEGIN");
    try { const results=[]; for (const s of statements) results.push(await s.run()); this.sqlite.exec("COMMIT"); return results; }
    catch(e) { this.sqlite.exec("ROLLBACK"); throw e; }
  }
}
const account = { id: "account-test", email: "member@example.test", created_at: 1 };
const token = "a".repeat(64);
async function fixture(t) {
  const DB = new SqliteD1(); t.after(() => DB.sqlite.close());
  DB.sqlite.prepare("INSERT INTO accounts (id,email,created_at,credential_version) VALUES (?,?,?,0)").run(account.id,account.email,account.created_at);
  const key = await crypto.subtle.generateKey("Ed25519",true,["sign","verify"]);
  const env = { DB, APP_BASE_URL: "https://tomonode.site", BILLING_ENABLED: "true", BILLING_MODE: "test", STRIPE_SECRET_KEY: "sk_test_fake_only",
    STRIPE_WEBHOOK_SECRET: "whsec_fake_only", STRIPE_PRICE_ID: "price_USD3", MEMBERSHIP_SIGNING_JWK: JSON.stringify(await crypto.subtle.exportKey("jwk",key.privateKey)), SESSION_PEPPER: "test-pepper" };
  return { DB, env, key };
}
function req(path, method="POST", body) {
  return new Request(`https://account-api.example.test${path}`, {method,headers:{authorization:`Bearer ${token}`}, ...(body?{body:JSON.stringify(body)}:{})});
}
function route(env,path,method="POST",body) { return handleBilling(req(path,method,body),env,async()=>account,async()=>true); }
function paidFixture(env) {
  const end = Math.floor(Date.now()/1000)+86400*30;
  const price = {id:env.STRIPE_PRICE_ID,active:true,livemode:false,currency:"usd",unit_amount:300,tax_behavior:"exclusive",type:"recurring",recurring:{interval:"month",interval_count:1,usage_type:"licensed"}};
  const sub = {id:"sub_test",livemode:false,customer:"cus_test",metadata:{account_id:account.id},status:"active",pause_collection:null,cancel_at_period_end:false,
    latest_invoice:"in_test",items:{has_more:false,data:[{quantity:1,price,current_period_end:end}]}};
  const invoice = {id:"in_test",livemode:false,status:"paid",subtotal:300,total_excluding_tax:300,total:375,amount_paid:375,automatic_tax:{enabled:true,status:"complete"},currency:"usd",customer:"cus_test",parent:{subscription_details:{subscription:"sub_test"}},
    lines:{has_more:false,data:[{amount:300,pricing:{price_details:{price:env.STRIPE_PRICE_ID}},period:{end}}]}};
  const payment = {invoice:"in_test",livemode:false,amount_paid:375,currency:"usd",payment:{type:"payment_intent",payment_intent:"pi_test"}};
  const intent = {status:"succeeded",livemode:false,amount_received:375,currency:"usd",latest_charge:"ch_test"};
  const charge = {id:"ch_test",paid:true,status:"succeeded",amount:375,currency:"usd",livemode:false,amount_refunded:0,disputed:false,customer:"cus_test"};
  const api = { subscriptions:{retrieve:async()=>structuredClone(sub)}, invoices:{retrieve:async()=>structuredClone(invoice)}, invoicePayments:{list:async()=>({has_more:false,data:[structuredClone(payment)]})},
    paymentIntents:{retrieve:async()=>structuredClone(intent)}, charges:{retrieve:async()=>structuredClone(charge)}, checkout:{sessions:{retrieve:async()=>({mode:"subscription",livemode:false,subscription:"sub_test"})}} };
  return { price,sub,invoice,payment,intent,charge,api,end };
}
function bindCustomer(DB) { DB.sqlite.prepare("INSERT INTO billing_customers(account_id,mode,customer_id) VALUES (?,'test','cus_test')").run(account.id); }
const event = (type, eid="evt_test", object={id:"sub_test"}) => ({id:eid,type,livemode:false,data:{object}});
const portalConfig = () => ({ id:"bpc_fixture", object:"billing_portal.configuration", active:true, is_default:true, livemode:false,
  features:{subscription_cancel:{enabled:true,mode:"at_period_end",proration_behavior:"none"}, subscription_update:{enabled:false},
    payment_method_update:{enabled:true},invoice_history:{enabled:true}} });
const portalConfigs = () => ({object:"list",has_more:false,data:[portalConfig()]});
const checkoutSession = (expiresAt, changes={}) => ({ id:"cs_one", object:"checkout.session", status:"open", livemode:false,
  mode:"subscription", customer:"cus_test", client_reference_id:account.id, metadata:{account_id:account.id},
  expires_at:expiresAt, success_url:"https://tomonode.site/account.html?billing=success",
  cancel_url:"https://tomonode.site/account.html?billing=cancel", automatic_tax:{enabled:true},
  consent_collection:{terms_of_service:"required"}, url:"https://checkout.stripe.com/c/pay/cs_one", ...changes });

test("configuration is fail-closed and separates test/live; Price is precisely USD3 monthly plus tax",async t=>{
  const {env}=await fixture(t); const {price}=paidFixture(env);
  assert.ok(billingConfigured(env)); assert.ok(validPrice(price,"test"));
  assert.ok(billingConfigured({...env,STRIPE_SECRET_KEY:"rk_test_restricted"}));
  assert.equal(billingConfigured({...env,STRIPE_SECRET_KEY:"rk_live_wrongmode"}),false);
  for(const changes of [{BILLING_ENABLED:"false"},{BILLING_MODE:"live"},{STRIPE_PRICE_ID:""},{MEMBERSHIP_SIGNING_JWK:""},{APP_BASE_URL:"https://evil.test"}]) assert.equal(billingConfigured({...env,...changes}),false);
  for(const changes of [{unit_amount:500},{currency:"jpy"},{livemode:true},{tax_behavior:"inclusive"},{active:false},{recurring:{interval:"year",interval_count:1,usage_type:"licensed"}}]) assert.equal(validPrice({...price,...changes},"test"),false);
  assert.ok(stripeDestination("https://checkout.stripe.com/c/pay/test",false));
  for(const bad of ["https://evil.test/", "https://checkout.stripe.com.evil.test/", "http://checkout.stripe.com/", "https://user@checkout.stripe.com/", "https://billing.stripe.com/"]) assert.equal(stripeDestination(bad,false),false);
});
test("existing modern auth protects checkout/status/lease and credential invalidation",async t=>{
  const {DB,env}=await fixture(t);
  for(const [path,method] of [["/v1/billing/checkout","POST"],["/v1/billing/portal","POST"],["/v1/billing/status","GET"],["/v1/membership/lease","GET"]]) assert.equal((await fetchHandler(req(path,method),env)).status,401);
  const hmac=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.SESSION_PEPPER),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const hash=Buffer.from(await crypto.subtle.sign("HMAC",hmac,new TextEncoder().encode(token))).toString("hex");
  DB.sqlite.prepare("INSERT INTO sessions(token_hash,account_id,expires_at,created_at,last_used_at,credential_version) VALUES (?,?,?,?,?,0)").run(hash,account.id,Date.now()+60000,Date.now(),Date.now());
  assert.equal((await fetchHandler(req("/v1/billing/status","GET"),env)).status,200);
  DB.sqlite.prepare("UPDATE accounts SET credential_version=1 WHERE id=?").run(account.id);
  assert.equal((await fetchHandler(req("/v1/billing/status","GET"),env)).status,401);
});
test("successful paid invoice, intent and non-refunded charge establishes rights, scheduled cancellation preserves paid period",async t=>{
  const {DB,env,key}=await fixture(t); bindCustomer(DB); const f=paidFixture(env); f.sub.cancel_at_period_end=true;
  await processBillingEvent(env,event("invoice.paid","evt_paid",{id:"in_test"}),f.api);
  const result=await route(env,"/v1/membership/lease","GET"); assert.equal(result.status,200);
  const signed=await result.json(); const bytes=Buffer.from(signed.payload,"base64url");
  assert.ok(await crypto.subtle.verify("Ed25519",key.publicKey,Buffer.from(signed.signature,"base64url"),bytes));
  const claims=JSON.parse(bytes); assert.equal(claims.mode,"test"); assert.equal(claims.subject,account.id); assert.equal(claims.paidUntil,f.end);
  assert.equal(claims.cancelAtPeriodEnd,true); assert.ok(claims.expiresAt-claims.issuedAt<=86400);
  assert.equal(claims.sessionBinding,Buffer.from(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))).toString("hex"));
  await processBillingEvent(env,event("invoice.paid","evt_paid",{id:"in_test"}),f.api);
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM billing_events").get().n,1);
});
test("a paid renewal advances the signed entitlement to the new paid period",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const f=paidFixture(env);
  await processBillingEvent(env,event("invoice.paid","evt_initial",{id:"in_test"}),f.api);
  const renewedEnd=f.end+86400*30;
  f.sub.latest_invoice="in_renewal";
  f.sub.items.data[0].current_period_end=renewedEnd;
  f.invoice.id="in_renewal";
  f.invoice.lines.data[0].period.end=renewedEnd;
  f.payment.invoice="in_renewal";
  await processBillingEvent(env,event("invoice.paid","evt_renewal",{id:"in_renewal"}),f.api);
  const result=await route(env,"/v1/membership/lease","GET");
  assert.equal(result.status,200);
  const claims=JSON.parse(Buffer.from((await result.json()).payload,"base64url"));
  assert.equal(claims.paidUntil,renewedEnd);
  assert.equal(DB.sqlite.prepare("SELECT paid_until FROM billing_subscriptions").get().paid_until,renewedEnd*1000);
});
test("renewal payment failure stops new leases; a subsequently verified payment restores them",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const f=paidFixture(env);
  await processBillingEvent(env,event("invoice.paid","evt_initial",{id:"in_test"}),f.api);
  assert.equal((await route(env,"/v1/membership/lease","GET")).status,200);
  f.sub.status="past_due"; f.invoice.status="open"; f.intent.status="requires_payment_method";
  await processBillingEvent(env,event("invoice.payment_failed","evt_failed",{id:"in_test"}),f.api);
  assert.equal((await route(env,"/v1/membership/lease","GET")).status,403);
  f.sub.status="active"; f.invoice.status="paid"; f.intent.status="succeeded";
  await processBillingEvent(env,event("invoice.paid","evt_recovered",{id:"in_test"}),f.api);
  assert.equal((await route(env,"/v1/membership/lease","GET")).status,200);
});
test("scheduled cancellation loses access at paid-period expiry even without a deletion webhook",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const f=paidFixture(env); f.sub.cancel_at_period_end=true;
  await processBillingEvent(env,event("customer.subscription.updated"),f.api);
  assert.equal((await route(env,"/v1/membership/lease","GET")).status,200);
  t.mock.method(Date,"now",()=>f.end*1000);
  assert.equal((await route(env,"/v1/membership/lease","GET")).status,403);
});
test("failed reconciliation is not acknowledged as processed and the same event can be retried",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const f=paidFixture(env);
  const notification=event("invoice.paid","evt_retry",{id:"in_test"});
  const failing={...f.api,subscriptions:{retrieve:async()=>{throw Error("temporary Stripe failure");}}};
  await assert.rejects(processBillingEvent(env,notification,failing));
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM billing_events").get().n,0);
  assert.equal((await route(env,"/v1/membership/lease","GET")).status,403);
  await processBillingEvent(env,notification,f.api);
  assert.equal((await route(env,"/v1/membership/lease","GET")).status,200);
  let reads=0;
  await processBillingEvent(env,notification,{...f.api,invoices:{retrieve:async()=>{reads++; throw Error("duplicate must not refetch");}}});
  assert.equal(reads,0);
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM billing_events").get().n,1);
});
test("billing and benefits belong only to the authenticated account, not a supplied customer or account ID",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const f=paidFixture(env);
  await processBillingEvent(env,event("invoice.paid","evt_owner",{id:"in_test"}),f.api);
  const other={id:"account-other",email:"other@example.test",created_at:2};
  DB.sqlite.prepare("INSERT INTO accounts(id,email,created_at,credential_version) VALUES (?,?,?,0)").run(other.id,other.email,other.created_at);
  t.mock.method(globalThis,"fetch",async()=>{throw Error("No Stripe request expected for an unbound account");});
  const lease=await handleBilling(req("/v1/membership/lease","GET"),env,async()=>other,async()=>true);
  assert.equal(lease.status,403);
  const portal=await handleBilling(req("/v1/billing/portal","POST",{accountId:account.id,customer:"cus_test"}),env,async()=>other,async()=>true);
  assert.equal(portal.status,409);
  assert.equal((await portal.json()).error,"NO_BILLING_ACCOUNT");
  for(const [path,method] of [["/v1/billing/checkout","POST"],["/v1/billing/portal","POST"],["/v1/membership/lease","GET"]]) {
    assert.equal((await handleBilling(req(path,method),env,async()=>null,async()=>true)).status,401);
  }
  assert.equal((await route(env,"/v1/membership/lease","GET")).status,200);
});
test("an active subscription without a real paid invoice never qualifies",async t=>{
  const {env}=await fixture(t); const f=paidFixture(env);
  for(const status of ["trialing","past_due","unpaid","canceled","incomplete","paused"]) assert.equal(await verifiedPaidUntil(f.api,env,{...f.sub,status}),0);
  for(const changes of [{latest_invoice:null},{pause_collection:{behavior:"keep_as_draft"}},{livemode:true},{items:{...f.sub.items,data:[{...f.sub.items.data[0],quantity:2}]}}]) assert.equal(await verifiedPaidUntil(f.api,env,{...f.sub,...changes}),0);
  f.invoice.status="open"; assert.equal(await verifiedPaidUntil(f.api,env,f.sub),0);
  f.invoice.status="paid"; f.invoice.amount_paid=0; assert.equal(await verifiedPaidUntil(f.api,env,f.sub),0);
});
test("refunded/disputed or wrong-price/zero-payment records cannot qualify",async t=>{
  const {env}=await fixture(t);
  for(const change of [f=>f.charge.amount_refunded=1, f=>f.charge.disputed=true, f=>f.charge.livemode=true, f=>f.invoice.currency="jpy",f=>f.invoice.parent.subscription_details.subscription="sub_other",
    f=>f.invoice.lines.data[0].pricing.price_details.price="price_other",f=>f.intent.status="processing",f=>f.payment.payment={type:"payment_record",payment_record:"pr_manual"}]) {
    const f=paidFixture(env); change(f); assert.equal(await verifiedPaidUntil(f.api,env,f.sub),0);
  }
});
test("refund financial hold survives stale invoice.paid",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const f=paidFixture(env);
  await processBillingEvent(env,event("customer.subscription.updated"),f.api);
  assert.equal((await route(env,"/v1/membership/lease","GET")).status,200);
  f.charge.amount_refunded=300;
  await processBillingEvent(env,event("charge.refunded","evt_refund",{id:"ch_test"}),f.api);
  f.charge.amount_refunded=0;
  await processBillingEvent(env,event("invoice.paid","evt_old_paid",{id:"in_test"}),f.api);
  assert.equal((await route(env,"/v1/membership/lease","GET")).status,403);
  assert.equal(DB.sqlite.prepare("SELECT financial_hold FROM billing_customers").get().financial_hold,1);
});

test("explicit account reconciliation recovers a paid purchase without any webhook or Stripe mutation",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const f=paidFixture(env);
  const reads=[];
  t.mock.method(globalThis,"fetch",async(input,init)=>{
    assert.equal(init.method,"GET"); const u=new URL(String(input)); assert.equal(u.hostname,"api.stripe.com"); reads.push(u.pathname);
    if(u.pathname==="/v1/subscriptions") { assert.equal(u.searchParams.get("customer"),"cus_test"); return Response.json({object:"list",has_more:false,data:[f.sub]}); }
    if(u.pathname==="/v1/subscriptions/sub_test") return Response.json(f.sub);
    if(u.pathname==="/v1/invoices/in_test") return Response.json(f.invoice);
    if(u.pathname==="/v1/invoice_payments") return Response.json({object:"list",has_more:false,data:[f.payment]});
    if(u.pathname==="/v1/payment_intents/pi_test") return Response.json(f.intent);
    if(u.pathname==="/v1/charges/ch_test") return Response.json(f.charge);
    throw Error("Unexpected provider request");
  });
  assert.equal((await route(env,"/v1/membership/lease","GET")).status,403);
  const result=await route(env,"/v1/billing/reconcile","POST",{customer:"cus_other",accountId:"other"});
  assert.deepEqual(await result.json(),{reconciled:true});
  assert.equal((await route(env,"/v1/membership/lease","GET")).status,200);
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM billing_events").get().n,0);
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM billing_checkout").get().n,0);
  assert.equal(reads.length,6);
});
test("account reconciliation handles cancellation and failed renewal when their notifications are missed",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const f=paidFixture(env);
  await processBillingEvent(env,event("invoice.paid"),f.api);
  f.api.subscriptions.list=async()=>({object:"list",has_more:false,data:[structuredClone(f.sub)]});
  f.sub.cancel_at_period_end=true;
  assert.equal((await reconcileAccountBilling(env,account,f.api)).status,200);
  let lease=JSON.parse(Buffer.from((await (await route(env,"/v1/membership/lease","GET")).json()).payload,"base64url"));
  assert.equal(lease.cancelAtPeriodEnd,true);
  for(const status of ["past_due","canceled"]) {
    f.sub.status="active";
    await processBillingEvent(env,event("invoice.paid",`evt_reconcile_${status}`,{id:"in_test"}),f.api);
    assert.equal((await route(env,"/v1/membership/lease","GET")).status,200);
    f.sub.status=status;
    assert.equal((await reconcileAccountBilling(env,account,f.api)).status,200);
    assert.equal((await route(env,"/v1/membership/lease","GET")).status,403);
  }
});
test("reconciliation never creates a customer or clears a financial hold",async t=>{
  const {DB,env}=await fixture(t); let calls=0;
  const api={subscriptions:{list:async()=>{calls++; throw Error("Must not contact Stripe");}}};
  assert.deepEqual(await (await reconcileAccountBilling(env,account,api)).json(),{reconciled:false});
  bindCustomer(DB); DB.sqlite.prepare("UPDATE billing_customers SET financial_hold=1").run();
  assert.equal((await reconcileAccountBilling(env,account,api)).status,409);
  assert.equal(calls,0); assert.equal(DB.sqlite.prepare("SELECT financial_hold FROM billing_customers").get().financial_hold,1);
});
test("reconciliation rejects ambiguous, cross-account, cross-mode and incomplete provider history before granting rights",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const f=paidFixture(env);
  for(const change of [{has_more:true},{data:[{...f.sub,customer:"cus_other"}]},{data:[{...f.sub,livemode:true}]},
    {data:[f.sub,f.sub]},{data:[{...f.sub,id:"invalid"}]}]) {
    const api={...f.api,subscriptions:{...f.api.subscriptions,list:async()=>({object:"list",has_more:false,data:[f.sub],...change})}};
    await assert.rejects(reconcileAccountBilling(env,account,api));
    assert.equal((await route(env,"/v1/membership/lease","GET")).status,403);
  }
  f.api.subscriptions.list=async()=>({object:"list",has_more:false,data:[f.sub]});
  const wrong={...f.api,subscriptions:{...f.api.subscriptions,retrieve:async()=>({...f.sub,id:"sub_other"})}};
  await assert.rejects(reconcileAccountBilling(env,account,wrong));
  assert.equal((await route(env,"/v1/membership/lease","GET")).status,403);
});
test("reconciliation cannot grant from unpaid, refunded or foreign account records",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB);
  for(const change of [f=>f.invoice.status="open",f=>f.charge.amount_refunded=1,f=>f.sub.metadata.account_id="other"]){
    const f=paidFixture(env); change(f); f.api.subscriptions.list=async()=>({object:"list",has_more:false,data:[f.sub]});
    if(f.sub.metadata.account_id!==account.id) await assert.rejects(reconcileAccountBilling(env,account,f.api));
    else await reconcileAccountBilling(env,account,f.api);
    assert.equal((await route(env,"/v1/membership/lease","GET")).status,403);
  }
});
test("reconciliation requires authentication, enablement and rate allowance before provider calls",async t=>{
  const {env}=await fixture(t); let calls=0;
  t.mock.method(globalThis,"fetch",async()=>{calls++; throw Error("Should be blocked");});
  assert.equal((await handleBilling(req("/v1/billing/reconcile"),env,async()=>null,async()=>true)).status,401);
  assert.equal((await route({...env,BILLING_ENABLED:"false"},"/v1/billing/reconcile")).status,503);
  assert.equal((await handleBilling(req("/v1/billing/reconcile"),env,async()=>account,async()=>false)).status,429);
  assert.equal(calls,0);
});

test("explicit reconciliation cannot take another account's subscription fence",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const f=paidFixture(env);
  await processBillingEvent(env,event("invoice.paid"),f.api);
  const original=DB.sqlite.prepare("SELECT fence FROM billing_reconciliation").get().fence;
  const other={id:"account-other",email:"other@example.test",created_at:2};
  DB.sqlite.prepare("INSERT INTO accounts(id,email,created_at,credential_version) VALUES (?,?,?,0)").run(other.id,other.email,other.created_at);
  DB.sqlite.prepare("INSERT INTO billing_customers(account_id,mode,customer_id) VALUES (?,'test','cus_other')").run(other.id);
  let reads=0;
  const api={subscriptions:{list:async()=>({object:"list",has_more:false,data:[{...f.sub,customer:"cus_other",metadata:{account_id:other.id}}]}),
    retrieve:async()=>{reads++; return f.sub;}}};
  await assert.rejects(reconcileAccountBilling(env,other,api));
  assert.equal(reads,0);
  assert.equal(DB.sqlite.prepare("SELECT fence FROM billing_reconciliation").get().fence,original);
  assert.equal((await route(env,"/v1/membership/lease","GET")).status,200);
});
test("zero applicable tax still qualifies; incomplete automatic tax never qualifies",async t=>{
  const {env}=await fixture(t); const f=paidFixture(env);
  f.invoice.total=300; f.invoice.amount_paid=300; f.payment.amount_paid=300;
  f.intent.amount_received=300; f.charge.amount=300;
  assert.equal(await verifiedPaidUntil(f.api,env,f.sub),f.end*1000);
  for(const status of ["requires_location_inputs","failed",null]) {
    f.invoice.automatic_tax.status=status;
    assert.equal(await verifiedPaidUntil(f.api,env,f.sub),0);
  }
});
test("past due and canceled canonical states remove an already granted qualification",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const f=paidFixture(env);
  for(const status of ["past_due","canceled"]) {
    f.sub.status="active";
    await processBillingEvent(env,event("invoice.paid",`evt_paid_${status}`,{id:"in_test"}),f.api);
    assert.equal((await route(env,"/v1/membership/lease","GET")).status,200);
    f.sub.status=status;
    await processBillingEvent(env,event("customer.subscription.updated",`evt_${status}`),f.api);
    assert.equal((await route(env,"/v1/membership/lease","GET")).status,403);
  }
});
test("unknown customer/account metadata and live events cannot bind test qualifications",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const f=paidFixture(env);
  await assert.rejects(processBillingEvent(env,{...event("customer.subscription.updated"),livemode:true},f.api));
  f.sub.metadata.account_id="other-account";
  await assert.rejects(processBillingEvent(env,event("customer.subscription.updated"),f.api));
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM billing_subscriptions").get().n,0);
});
test("out-of-order concurrent canonical responses cannot resurrect canceled subscriptions",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const f=paidFixture(env);
  let release; let started;
  const ready=new Promise(resolve=>started=resolve);
  const slow={...f.api,subscriptions:{retrieve:async()=>{const stale=structuredClone(f.sub); started(); await new Promise(resolve=>release=resolve); return stale;}}};
  const older=processBillingEvent(env,event("customer.subscription.updated","evt_slow"),slow); await ready;
  f.sub.status="canceled";
  await processBillingEvent(env,event("customer.subscription.deleted","evt_new"),f.api);
  release(); await older;
  const row=DB.sqlite.prepare("SELECT status,paid_until FROM billing_subscriptions").get(); assert.equal(row.status,"canceled"); assert.equal(row.paid_until,0);
});
test("legacy subscriptions are never automatically promoted and expires fail closed",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB);
  DB.sqlite.prepare("INSERT INTO subscriptions(stripe_subscription_id,account_id,status,current_period_end,updated_at) VALUES ('legacy',?,'active',?,?)").run(account.id,Date.now()+99999999,Date.now());
  assert.equal((await route(env,"/v1/membership/lease","GET")).status,403);
  const f=paidFixture(env); await processBillingEvent(env,event("customer.subscription.updated"),f.api);
  DB.sqlite.prepare("UPDATE billing_subscriptions SET paid_until=?").run(Date.now()-1);
  assert.equal((await route(env,"/v1/membership/lease","GET")).status,403);
});
test("forged and wrong-mode signed webhooks are rejected, signed unknown event is idempotent",async t=>{
  const {DB,env}=await fixture(t); const api=new Stripe(env.STRIPE_SECRET_KEY);
  async function send(data,forge=false) {
    const payload=JSON.stringify(data);
    const signature=forge?"t=1,v1=forged":await api.webhooks.generateTestHeaderStringAsync({payload,secret:env.STRIPE_WEBHOOK_SECRET,cryptoProvider:Stripe.createSubtleCryptoProvider()});
    return fetchHandler(new Request("https://account-api.example.test/v1/webhooks/stripe",{method:"POST",headers:{"stripe-signature":signature},body:payload}),env);
  }
  assert.equal((await send(event("ignored"),true)).status,400);
  assert.equal((await send({...event("ignored"),livemode:true})).status,400);
  assert.equal((await send(event("ignored"))).status,200); assert.equal((await send(event("ignored"))).status,200);
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM billing_events").get().n,1);
});
test("checkout ignores client Price/account/return URL; simultaneous clicks reuse one Stripe session",async t=>{
  const {DB,env}=await fixture(t); const {price}=paidFixture(env); const sessions=new Map(); const calls=[];
  t.mock.method(globalThis,"fetch",async(input,init)=>{
    const url=String(input); const body=new URLSearchParams(init?.body); const headers=new Headers(init?.headers); calls.push({url,body,headers});
    if(url.includes("/prices/")) return Response.json(price);
    if(url.includes("/billing_portal/configurations?")) return Response.json(portalConfigs());
    if(url.includes("/customers")) return Response.json({id:"cus_test",livemode:false});
    if(url.includes("/subscriptions?")) return Response.json({object:"list",has_more:false,data:[]});
    if(url.endsWith("/checkout/sessions")) {
      const key=headers.get("idempotency-key");
      if(!sessions.has(key)) sessions.set(key,checkoutSession(Number(body.get("expires_at"))));
      assert.equal(body.get("line_items[0][price]"),env.STRIPE_PRICE_ID); assert.equal(body.get("client_reference_id"),account.id);
      assert.equal(body.get("customer"),"cus_test"); assert.equal(body.get("mode"),"subscription");
      assert.equal(body.get("success_url"),"https://tomonode.site/account.html?billing=success");
      assert.equal(body.get("consent_collection[terms_of_service]"),"required");
      assert.equal(body.get("automatic_tax[enabled]"),"true");
      assert.equal(body.get("customer_update[address]"),"auto");
      return Response.json(sessions.get(key));
    }
    if(url.includes("/checkout/sessions/cs_one")) return Response.json([...sessions.values()][0]);
    throw Error("Unexpected Stripe endpoint");
  });
  const results=await Promise.all([route(env,"/v1/billing/checkout","POST",{priceId:"price_free",accountId:"other",returnUrl:"https://evil.test"}),route(env,"/v1/billing/checkout")]);
  assert.deepEqual(results.map(r=>r.status),[200,200]); assert.equal(sessions.size,1);
  assert.equal((await route(env,"/v1/billing/checkout")).status,200); assert.equal(sessions.size,1);
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM billing_customers").get().n,1);
});

test("created Checkout must match the authenticated customer, account and approved session context",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const {price}=paidFixture(env); let changes={},creates=0;
  t.mock.method(globalThis,"fetch",async(input,init)=>{
    const url=String(input);
    if(url.includes("/prices/")) return Response.json(price);
    if(url.includes("/billing_portal/configurations?")) return Response.json(portalConfigs());
    if(url.includes("/subscriptions?")) return Response.json({object:"list",has_more:false,data:[]});
    if(url.endsWith("/checkout/sessions")) {
      creates++; const body=new URLSearchParams(init.body);
      return Response.json(checkoutSession(Number(body.get("expires_at")),changes));
    }
    throw Error("Unexpected Stripe request");
  });
  for(const value of [{object:"payment_intent"},{id:"bad/path"},{mode:"payment"},{customer:"cus_other"},
    {client_reference_id:"account-other"},{metadata:{account_id:"account-other"}},{livemode:true},
    {expires_at:Math.floor(Date.now()/1000)+86400},{success_url:"https://evil.test/"},{cancel_url:"https://evil.test/"},
    {automatic_tax:{enabled:false}},{consent_collection:{terms_of_service:"none"}},{url:"https://evil.test/"}]) {
    changes=value;
    const result=await route(env,"/v1/billing/checkout");
    assert.equal(result.status,502,JSON.stringify(value));
    assert.deepEqual(await result.json(),{error:"BILLING_UNAVAILABLE"});
    assert.equal(DB.sqlite.prepare("SELECT session_id FROM billing_checkout").get().session_id,null);
  }
  assert.equal(creates,13);
  changes={customer:{id:"cus_test"}};
  assert.equal((await route(env,"/v1/billing/checkout")).status,200);
});

test("a reused Checkout must match its stored session ID and owner; mismatches do not mint another session",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const {price}=paidFixture(env);
  const expires=Date.now()+31*60000; let changes={},creates=0,reads=0;
  DB.sqlite.prepare("INSERT INTO billing_checkout(account_id,mode,price_id,attempt,session_id,expires_at) VALUES (?,?,?,?,?,?)")
    .run(account.id,"test",env.STRIPE_PRICE_ID,"existing-attempt","cs_one",expires);
  t.mock.method(globalThis,"fetch",async(input)=>{
    const url=String(input);
    if(url.includes("/prices/")) return Response.json(price);
    if(url.includes("/billing_portal/configurations?")) return Response.json(portalConfigs());
    if(url.includes("/subscriptions?")) return Response.json({object:"list",has_more:false,data:[]});
    if(url.endsWith("/checkout/sessions/cs_one")) { reads++; return Response.json(checkoutSession(Math.floor(expires/1000),changes)); }
    if(url.endsWith("/checkout/sessions")) { creates++; throw Error("No replacement session allowed"); }
    throw Error("Unexpected Stripe request");
  });
  for(const value of [{id:"cs_another"},{customer:"cus_other"},{client_reference_id:"account-other"}]) {
    changes=value; const result=await route(env,"/v1/billing/checkout");
    assert.equal(result.status,502); assert.deepEqual(await result.json(),{error:"BILLING_UNAVAILABLE"});
  }
  changes={}; assert.equal((await route(env,"/v1/billing/checkout")).status,200);
  assert.equal(creates,0); assert.equal(reads,4);
  assert.equal(DB.sqlite.prepare("SELECT attempt,session_id FROM billing_checkout").get().attempt,"existing-attempt");
});

test("completed or expired Checkout never exposes an URL or creates a second session",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const {price}=paidFixture(env); const expires=Date.now()+31*60000; let status="complete";
  DB.sqlite.prepare("INSERT INTO billing_checkout(account_id,mode,price_id,attempt,session_id,expires_at) VALUES (?,?,?,?,?,?)")
    .run(account.id,"test",env.STRIPE_PRICE_ID,"closed-attempt","cs_one",expires);
  t.mock.method(globalThis,"fetch",async(input)=>{
    const url=String(input);
    if(url.includes("/prices/")) return Response.json(price);
    if(url.includes("/billing_portal/configurations?")) return Response.json(portalConfigs());
    if(url.includes("/subscriptions?")) return Response.json({object:"list",has_more:false,data:[]});
    if(url.endsWith("/checkout/sessions/cs_one")) return Response.json(checkoutSession(Math.floor(expires/1000),{status}));
    throw Error("No new session allowed");
  });
  for(const value of ["complete","expired"]) {
    status=value; const result=await route(env,"/v1/billing/checkout");
    assert.equal(result.status,409); assert.deepEqual(await result.json(),{error:"CHECKOUT_PENDING"});
  }
});

test("an open Checkout that expires during the Stripe read is not exposed or replaced",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const {price}=paidFixture(env);
  const now=Date.now(),expires=now+31*60000; let time=now;
  t.mock.method(Date,"now",()=>time);
  DB.sqlite.prepare("INSERT INTO billing_checkout(account_id,mode,price_id,attempt,session_id,expires_at) VALUES (?,?,?,?,?,?)")
    .run(account.id,"test",env.STRIPE_PRICE_ID,"expiring-attempt","cs_one",expires);
  t.mock.method(globalThis,"fetch",async(input)=>{
    const url=String(input);
    if(url.includes("/prices/")) return Response.json(price);
    if(url.includes("/billing_portal/configurations?")) return Response.json(portalConfigs());
    if(url.includes("/subscriptions?")) return Response.json({object:"list",has_more:false,data:[]});
    if(url.endsWith("/checkout/sessions/cs_one")) {
      time=Math.floor(expires/1000)*1000;
      return Response.json(checkoutSession(Math.floor(expires/1000)));
    }
    throw Error("No replacement session allowed");
  });
  const result=await route(env,"/v1/billing/checkout");
  assert.equal(result.status,409); assert.deepEqual(await result.json(),{error:"CHECKOUT_PENDING"});
  assert.equal(DB.sqlite.prepare("SELECT attempt FROM billing_checkout").get().attempt,"expiring-attempt");
});

test("a lost Stripe response is retried with identical idempotency and one purchase session",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const {price}=paidFixture(env); const sessions=new Map(),calls=[]; let lost=true;
  t.mock.method(globalThis,"fetch",async(input,init)=>{
    const url=String(input);
    if(url.includes("/prices/")) return Response.json(price);
    if(url.includes("/billing_portal/configurations?")) return Response.json(portalConfigs());
    if(url.includes("/subscriptions?")) return Response.json({object:"list",has_more:false,data:[]});
    if(url.endsWith("/checkout/sessions")) {
      const key=new Headers(init.headers).get("idempotency-key"),body=new URLSearchParams(init.body);
      calls.push({key,body:body.toString()});
      if(!sessions.has(key)) sessions.set(key,checkoutSession(Number(body.get("expires_at"))));
      if(lost) { lost=false; throw new TypeError("Simulated connection lost after server acceptance"); }
      return Response.json(sessions.get(key));
    }
    throw Error("Unexpected Stripe request");
  });
  const result=await route(env,"/v1/billing/checkout"); assert.equal(result.status,200);
  assert.equal(sessions.size,1); assert.equal(calls.length,2); assert.deepEqual(calls[0],calls[1]);
  assert.equal(DB.sqlite.prepare("SELECT session_id FROM billing_checkout").get().session_id,"cs_one");
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM billing_subscriptions").get().n,0);
});

test("a failed local session save can recover with the same attempt without creating a duplicate",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const {price}=paidFixture(env); const sessions=new Map(),calls=[];
  const prepare=DB.prepare.bind(DB); let saveFails=true;
  t.mock.method(DB,"prepare",sql=>{
    const statement=prepare(sql);
    if(saveFails && sql.startsWith("UPDATE billing_checkout SET session_id=")) {
      saveFails=false; statement.run=async()=>{throw Error("Simulated database write failure");};
    }
    return statement;
  });
  t.mock.method(globalThis,"fetch",async(input,init)=>{
    const url=String(input);
    if(url.includes("/prices/")) return Response.json(price);
    if(url.includes("/billing_portal/configurations?")) return Response.json(portalConfigs());
    if(url.includes("/subscriptions?")) return Response.json({object:"list",has_more:false,data:[]});
    if(url.endsWith("/checkout/sessions")) {
      const key=new Headers(init.headers).get("idempotency-key"),body=new URLSearchParams(init.body);
      calls.push({key,body:body.toString()});
      if(!sessions.has(key)) sessions.set(key,checkoutSession(Number(body.get("expires_at"))));
      return Response.json(sessions.get(key));
    }
    throw Error("Unexpected Stripe request");
  });
  const failed=await route(env,"/v1/billing/checkout"); assert.equal(failed.status,502);
  assert.deepEqual(await failed.json(),{error:"BILLING_UNAVAILABLE"});
  assert.equal(DB.sqlite.prepare("SELECT session_id FROM billing_checkout").get().session_id,null);
  const result=await route(env,"/v1/billing/checkout"); assert.equal(result.status,200);
  assert.equal(sessions.size,1); assert.equal(calls.length,2); assert.deepEqual(calls[0],calls[1]);
  assert.equal(DB.sqlite.prepare("SELECT session_id FROM billing_checkout").get().session_id,"cs_one");
});
test("disabled configuration, account rate limit and oversized webhook fail without Stripe calls",async t=>{
  const {env}=await fixture(t);
  t.mock.method(globalThis,"fetch",async()=>{throw Error("No external request expected");});
  assert.equal((await route({...env,BILLING_ENABLED:"false"},"/v1/billing/checkout")).status,503);
  assert.equal((await route({...env,MEMBERSHIP_SIGNING_JWK:"{}"},"/v1/billing/checkout")).status,503);
  const other=await crypto.subtle.generateKey("Ed25519",true,["sign","verify"]);
  const mismatched={...JSON.parse(env.MEMBERSHIP_SIGNING_JWK),x:(await crypto.subtle.exportKey("jwk",other.publicKey)).x};
  assert.equal((await route({...env,MEMBERSHIP_SIGNING_JWK:JSON.stringify(mismatched)},"/v1/billing/checkout")).status,503);
  assert.equal((await handleBilling(req("/v1/billing/checkout"),env,async()=>account,async()=>false)).status,429);
  const result=await fetchHandler(new Request("https://account-api.example.test/v1/webhooks/stripe",{method:"POST",body:"x".repeat(256001)}),env);
  assert.equal(result.status,413);
});
test("production rollout flag keeps authenticated billing disabled without Stripe calls or billing writes",async t=>{
  const {DB,env}=await fixture(t);
  const disabled={...env,BILLING_ENABLED:"false"};
  const hmac=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.SESSION_PEPPER),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const hash=Buffer.from(await crypto.subtle.sign("HMAC",hmac,new TextEncoder().encode(token))).toString("hex");
  DB.sqlite.prepare("INSERT INTO sessions(token_hash,account_id,expires_at,created_at,last_used_at,credential_version) VALUES (?,?,?,?,?,0)").run(hash,account.id,Date.now()+60000,Date.now(),Date.now());
  let calls=0;
  t.mock.method(globalThis,"fetch",async()=>{calls++; throw Error("No Stripe request expected while disabled");});
  const status=await fetchHandler(req("/v1/billing/status","GET"),disabled);
  assert.equal(status.status,200);
  assert.equal((await status.json()).enabled,false);
  for(const [path,method] of [["/v1/billing/checkout","POST"],["/v1/billing/portal","POST"],["/v1/membership/lease","GET"],["/v1/webhooks/stripe","POST"]]) {
    const result=await fetchHandler(req(path,method),disabled);
    assert.equal(result.status,503);
    assert.equal((await result.json()).error,"BILLING_NOT_CONFIGURED");
  }
  assert.equal(calls,0);
  for(const table of ["billing_customers","billing_subscriptions","billing_checkout","billing_events","billing_reconciliation"]) assert.equal(DB.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,0);
});

test("already subscribed blocks new Checkout; Portal uses only authenticated customer and Stripe domain",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); const {price}=paidFixture(env); let portalCalls=0;
  t.mock.method(globalThis,"fetch",async(input,init)=>{
    const url=String(input);
    if(url.includes("/prices/")) return Response.json(price);
    if(url.includes("/billing_portal/configurations?")) return Response.json(portalConfigs());
    if(url.includes("/subscriptions?")) return Response.json({object:"list",has_more:false,data:[{status:"active"}]});
    if(url.endsWith("/billing_portal/sessions")) {
      const body=new URLSearchParams(init.body);
      portalCalls++; assert.equal(body.get("customer"),"cus_test"); assert.equal(body.get("configuration"),"bpc_fixture");
      assert.equal(body.get("return_url"),"https://tomonode.site/account.html");
      return Response.json({customer:"cus_test",configuration:"bpc_fixture",livemode:false,return_url:"https://tomonode.site/account.html",
        url:portalCalls===1?"https://billing.stripe.com/p/session/test":"https://evil.test/"});
    }
    throw Error("Unexpected Stripe endpoint");
  });
  assert.equal((await route(env,"/v1/billing/checkout")).status,409);
  assert.equal((await route(env,"/v1/billing/portal","POST",{customer:"cus_other"})).status,200);
  assert.equal((await route(env,"/v1/billing/portal")).status,502);
});

test("Portal contract requires period-end cancellation, no price changes, invoices and payment-method updates",()=>{
  const good=portalConfig(); assert.equal(validPortalConfiguration(good,"test"),true);
  assert.equal(validPortalConfiguration({...good,livemode:true},"live"),true);
  assert.equal(validPortalConfiguration(good,"unknown"),false);
  for(const changes of [{object:"wrong"},{id:"evil/path"},{active:false},{is_default:false},{livemode:true},
    {features:{}}, {features:{...good.features,subscription_cancel:{enabled:false,mode:"at_period_end",proration_behavior:"none"}}},
    {features:{...good.features,subscription_cancel:{enabled:true,mode:"immediately",proration_behavior:"none"}}},
    {features:{...good.features,subscription_cancel:{enabled:true,mode:"at_period_end",proration_behavior:"create_prorations"}}},
    {features:{...good.features,subscription_update:{enabled:true}}},
    {features:{...good.features,payment_method_update:{enabled:false}}},
    {features:{...good.features,invoice_history:{enabled:false}}}]) {
    assert.equal(validPortalConfiguration({...good,...changes},"test"),false);
  }
});

test("unsafe or ambiguous Portal configuration prevents Checkout before customer/payment/database writes",async t=>{
  const {DB,env}=await fixture(t); const {price}=paidFixture(env); let current,unexpected=0;
  t.mock.method(globalThis,"fetch",async(input,init)=>{
    const url=new URL(String(input));
    assert.equal(url.hostname,"api.stripe.com"); assert.equal(init.method,"GET");
    if(url.pathname.startsWith("/v1/prices/")) return Response.json(price);
    if(url.pathname==="/v1/billing_portal/configurations") {
      assert.equal(url.searchParams.get("active"),"true"); assert.equal(url.searchParams.get("is_default"),"true");
      assert.equal(url.searchParams.get("limit"),"2"); return Response.json(current);
    }
    unexpected++; throw Error("No customer or payment endpoint expected");
  });
  const unsafe={...portalConfig(),features:{...portalConfig().features,subscription_cancel:{enabled:false}}};
  for(const value of [{...portalConfigs(),data:[]}, {...portalConfigs(),has_more:true},
    {...portalConfigs(),data:[portalConfig(),portalConfig()]}, {...portalConfigs(),data:[unsafe]},
    {...portalConfigs(),data:[{...portalConfig(),livemode:true}]}]) {
    current=value;
    const result=await route(env,"/v1/billing/checkout"); assert.equal(result.status,503);
    assert.equal((await result.json()).error,"BILLING_NOT_CONFIGURED");
  }
  assert.equal(unexpected,0);
  for(const table of ["billing_customers","billing_checkout","billing_subscriptions"])
    assert.equal(DB.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,0);
});

test("Portal metadata denial is generic and cannot create Checkout or expose Stripe error details",async t=>{
  const {DB,env}=await fixture(t); const {price}=paidFixture(env); let writes=0;
  t.mock.method(globalThis,"fetch",async(input,init)=>{
    if(init.method!=="GET") writes++;
    if(String(input).includes("/prices/")) return Response.json(price);
    return Response.json({error:{type:"invalid_request_error",message:"sensitive-provider-detail"}},{status:403});
  });
  const result=await route(env,"/v1/billing/checkout"); assert.equal(result.status,502);
  assert.deepEqual(await result.json(),{error:"BILLING_UNAVAILABLE"}); assert.equal(writes,0);
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM billing_customers").get().n,0);
});

test("Portal refuses unsafe settings and session context mismatches without exposing an access URL",async t=>{
  const {DB,env}=await fixture(t); bindCustomer(DB); let config=portalConfig(),changes={},created=0;
  t.mock.method(globalThis,"fetch",async(input,init)=>{
    const url=String(input);
    if(url.includes("/billing_portal/configurations?")) return Response.json({...portalConfigs(),data:[config]});
    if(url.endsWith("/billing_portal/sessions")) {
      created++; const body=new URLSearchParams(init.body);
      assert.equal(body.get("customer"),"cus_test"); assert.equal(body.get("configuration"),"bpc_fixture");
      return Response.json({customer:"cus_test",configuration:"bpc_fixture",livemode:false,
        return_url:"https://tomonode.site/account.html",url:"https://billing.stripe.com/p/session/private-fixture",...changes});
    }
    throw Error("Unexpected endpoint");
  });
  config={...portalConfig(),features:{...portalConfig().features,subscription_update:{enabled:true}}};
  assert.equal((await route(env,"/v1/billing/portal")).status,503); assert.equal(created,0);
  config=portalConfig();
  for(const value of [{customer:"cus_other"},{livemode:true},{configuration:"bpc_other"},{return_url:"https://evil.test/"},
    {url:"https://evil.test/"}]) {
    changes=value;
    const result=await route(env,"/v1/billing/portal","POST",{configuration:"bpc_client",customer:"cus_other"});
    assert.equal(result.status,502); assert.deepEqual(await result.json(),{error:"BILLING_UNAVAILABLE"});
  }
  changes={configuration:{id:"bpc_fixture"}};
  assert.equal((await route(env,"/v1/billing/portal")).status,200);
});
