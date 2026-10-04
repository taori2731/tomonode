import Stripe from "stripe";

export interface BillingEnv {
  DB: D1Database;
  APP_BASE_URL: string;
  BILLING_ENABLED?: string;
  BILLING_MODE?: "test" | "live";
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  MEMBERSHIP_SIGNING_JWK?: string;
}
export type BillingAccount = { id: string; email: string; created_at: number };
type Customer = { customer_id: string; financial_hold: number };
type Qualification = { paid_until: number; cancel_at_period_end: number; status: string };
const blockingStatuses = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);
const checkoutSuccessUrl = "https://tomonode.site/account.html?billing=success";
const checkoutCancelUrl = "https://tomonode.site/account.html?billing=cancel";
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  "cache-control": "no-store, max-age=0", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
} });
const fail = (code: string, status = 503) => response({ error: code }, status);
const id = (value: string | { id: string } | null | undefined) => typeof value === "string" ? value : value?.id;

export function billingConfigured(env: BillingEnv): boolean {
  return env.BILLING_ENABLED === "true" && (env.BILLING_MODE === "test" || env.BILLING_MODE === "live")
    && new RegExp(`^(sk|rk)_${env.BILLING_MODE}_`).test(env.STRIPE_SECRET_KEY ?? "")
    && !!env.STRIPE_WEBHOOK_SECRET && /^price_[A-Za-z0-9]+$/.test(env.STRIPE_PRICE_ID ?? "")
    && !!env.MEMBERSHIP_SIGNING_JWK && env.APP_BASE_URL === "https://tomonode.site";
}
async function verifiedSigningKey(env: BillingEnv): Promise<CryptoKey> {
  const jwk = JSON.parse(env.MEMBERSHIP_SIGNING_JWK!);
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !/^[A-Za-z0-9_-]{43}$/.test(jwk.x ?? "") || !/^[A-Za-z0-9_-]{43}$/.test(jwk.d ?? "")) throw new Error("signing key");
  const privateKey = await crypto.subtle.importKey("jwk", jwk, "Ed25519", false, ["sign"]);
  const publicKey = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: jwk.x }, "Ed25519", false, ["verify"]);
  const probe = new TextEncoder().encode("tomonode-membership-key-preflight");
  const signature = await crypto.subtle.sign("Ed25519", privateKey, probe);
  if (!(await crypto.subtle.verify("Ed25519", publicKey, signature, probe))) throw new Error("signing key pair");
  return privateKey;
}
function stripe(env: BillingEnv) {
  return new Stripe(env.STRIPE_SECRET_KEY!, { apiVersion: "2026-09-30.endive", httpClient: Stripe.createFetchHttpClient(), timeout: 15000, maxNetworkRetries: 2 });
}
export function validPrice(price: Stripe.Price, mode: string): boolean {
  // USD 3/month plus applicable tax. No metered, trial or coupon pricing.
  return price.active && price.livemode === (mode === "live") && price.currency === "usd"
    && price.unit_amount === 300 && price.tax_behavior === "exclusive" && price.type === "recurring"
    && price.recurring?.interval === "month" && price.recurring.interval_count === 1
    && price.recurring.usage_type === "licensed";
}
export function stripeDestination(value: string | null, portal: boolean): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && url.hostname === (portal ? "billing.stripe.com" : "checkout.stripe.com");
  } catch { return false; }
}
export function validPortalConfiguration(config: Stripe.BillingPortal.Configuration, mode: string): boolean {
  // The approved sales policy promises period-end cancellation, not immediate loss of paid time.
  return (mode === "test" || mode === "live") && config?.object === "billing_portal.configuration" && /^bpc_[A-Za-z0-9]+$/.test(config.id)
    && config.active === true && config.is_default === true && config.livemode === (mode === "live")
    && config.features?.subscription_cancel?.enabled === true
    && config.features.subscription_cancel.mode === "at_period_end"
    && config.features.subscription_cancel.proration_behavior === "none"
    && config.features?.subscription_update?.enabled === false
    && config.features?.payment_method_update?.enabled === true
    && config.features?.invoice_history?.enabled === true;
}
async function verifiedPortalConfiguration(api: Stripe, mode: string): Promise<string | null> {
  const configs = await api.billingPortal.configurations.list({ active: true, is_default: true, limit: 2 });
  if (configs.object !== "list" || configs.has_more !== false || configs.data.length !== 1
    || !validPortalConfiguration(configs.data[0], mode)) return null;
  return configs.data[0].id;
}
async function customer(env: BillingEnv, account: BillingAccount, api: Stripe): Promise<Customer> {
  const existing = await env.DB.prepare("SELECT customer_id, financial_hold FROM billing_customers WHERE account_id = ? AND mode = ?")
    .bind(account.id, env.BILLING_MODE).first<Customer>();
  if (existing) return existing;
  const created = await api.customers.create({ email: account.email, metadata: { account_id: account.id } },
    { idempotencyKey: `customer:${env.BILLING_MODE}:${account.id}` });
  if (created.livemode !== (env.BILLING_MODE === "live")) throw new Error("mode");
  await env.DB.prepare("INSERT OR IGNORE INTO billing_customers (account_id,mode,customer_id) VALUES (?,?,?)")
    .bind(account.id, env.BILLING_MODE, created.id).run();
  const stored = await env.DB.prepare("SELECT customer_id, financial_hold FROM billing_customers WHERE account_id = ? AND mode = ?")
    .bind(account.id, env.BILLING_MODE).first<Customer>();
  if (!stored) throw new Error("customer");
  return stored;
}
function validCheckoutContext(session: Stripe.Checkout.Session, env: BillingEnv, account: BillingAccount,
  customerId: string, pending: { session_id: string | null; expires_at: number }): boolean {
  // A Stripe-hosted URL alone doesn't establish which account or purchase it belongs to.
  // Apply the same checks to a new response and to a previously stored session.
  return session.object === "checkout.session" && /^cs_[A-Za-z0-9_]+$/.test(session.id)
    && (!pending.session_id || session.id === pending.session_id)
    && session.mode === "subscription" && session.livemode === (env.BILLING_MODE === "live")
    && id(session.customer) === customerId && session.client_reference_id === account.id
    && session.metadata?.account_id === account.id
    && Number.isSafeInteger(session.expires_at) && session.expires_at === Math.floor(pending.expires_at / 1000)
    && session.success_url === checkoutSuccessUrl && session.cancel_url === checkoutCancelUrl
    && session.automatic_tax?.enabled === true && session.consent_collection?.terms_of_service === "required"
    && stripeDestination(session.url, false);
}
async function checkout(env: BillingEnv, account: BillingAccount): Promise<Response> {
  // Never collect a payment if this worker cannot sign a verifiable qualification.
  try { await verifiedSigningKey(env); } catch { return fail("BILLING_NOT_CONFIGURED"); }
  const api = stripe(env);
  if (!validPrice(await api.prices.retrieve(env.STRIPE_PRICE_ID!), env.BILLING_MODE!)) return fail("BILLING_NOT_CONFIGURED");
  // Check self-service cancellation before creating a customer or collecting any payment.
  if (!(await verifiedPortalConfiguration(api, env.BILLING_MODE!))) return fail("BILLING_NOT_CONFIGURED");
  const billing = await customer(env, account, api);
  if (billing.financial_hold) return fail("BILLING_REVIEW_REQUIRED", 409);
  // Read Stripe too: a paid but not yet delivered webhook must not allow a second subscription.
  const subscriptions = await api.subscriptions.list({ customer: billing.customer_id, status: "all", limit: 100 });
  if (subscriptions.has_more || subscriptions.data.some(sub => blockingStatuses.has(sub.status))) {
    return fail("SUBSCRIPTION_ALREADY_EXISTS", 409);
  }
  const now = Date.now();
  const attempt = crypto.randomUUID();
  // Reuse one idempotent session for the entire lifetime; concurrent clicks cannot mint multiple sessions.
  await env.DB.prepare(`INSERT INTO billing_checkout (account_id,mode,price_id,attempt,expires_at) VALUES (?,?,?,?,?)
    ON CONFLICT(account_id,mode) DO UPDATE SET price_id=excluded.price_id,attempt=excluded.attempt,
      session_id=NULL,expires_at=excluded.expires_at WHERE billing_checkout.expires_at <= ?`)
    .bind(account.id, env.BILLING_MODE, env.STRIPE_PRICE_ID, attempt, now + 31 * 60000, now).run();
  const pending = await env.DB.prepare("SELECT price_id,attempt,session_id,expires_at FROM billing_checkout WHERE account_id=? AND mode=?")
    .bind(account.id, env.BILLING_MODE).first<{price_id: string; attempt: string; session_id: string | null; expires_at: number}>();
  if (!pending || pending.price_id !== env.STRIPE_PRICE_ID) return fail("CHECKOUT_PENDING", 409);
  const result = pending.session_id ? await api.checkout.sessions.retrieve(pending.session_id)
    : await api.checkout.sessions.create({
      mode: "subscription", customer: billing.customer_id, client_reference_id: account.id,
      line_items: [{ price: env.STRIPE_PRICE_ID!, quantity: 1 }],
      metadata: { account_id: account.id }, subscription_data: { metadata: { account_id: account.id } },
      consent_collection: { terms_of_service: "required" },
      automatic_tax: { enabled: true },
      customer_update: { address: "auto" },
      success_url: checkoutSuccessUrl,
      cancel_url: checkoutCancelUrl,
      expires_at: Math.floor(pending.expires_at / 1000),
    }, { idempotencyKey: `checkout:${env.BILLING_MODE}:${pending.attempt}` });
  if (result.status !== "open") return fail("CHECKOUT_PENDING", 409);
  if (!validCheckoutContext(result, env, account, billing.customer_id, pending)) return fail("BILLING_UNAVAILABLE", 502);
  if (result.expires_at * 1000 <= Date.now()) return fail("CHECKOUT_PENDING", 409);
  await env.DB.prepare("UPDATE billing_checkout SET session_id=? WHERE account_id=? AND mode=? AND attempt=?")
    .bind(result.id, account.id, env.BILLING_MODE, pending.attempt).run();
  return response({ url: result.url });
}
async function portal(env: BillingEnv, account: BillingAccount): Promise<Response> {
  const row = await env.DB.prepare("SELECT customer_id FROM billing_customers WHERE account_id=? AND mode=?")
    .bind(account.id, env.BILLING_MODE).first<{customer_id: string}>();
  if (!row) return fail("NO_BILLING_ACCOUNT", 409);
  const api = stripe(env);
  const configuration = await verifiedPortalConfiguration(api, env.BILLING_MODE!);
  if (!configuration) return fail("BILLING_NOT_CONFIGURED");
  // Pin the inspected configuration; don't silently pick a changed default during session creation.
  const result = await api.billingPortal.sessions.create({ customer: row.customer_id, configuration,
    return_url: "https://tomonode.site/account.html" });
  if (result.livemode !== (env.BILLING_MODE === "live") || result.customer !== row.customer_id
    || id(result.configuration) !== configuration || result.return_url !== "https://tomonode.site/account.html"
    || !stripeDestination(result.url, true)) return fail("BILLING_UNAVAILABLE", 502);
  return response({ url: result.url });
}

export async function verifiedPaidUntil(api: Stripe, env: BillingEnv, sub: Stripe.Subscription): Promise<number> {
  const item = sub.items.data[0];
  if (sub.status !== "active" || sub.pause_collection || sub.livemode !== (env.BILLING_MODE === "live")
    || sub.items.has_more || sub.items.data.length !== 1 || item?.quantity !== 1 || item.price.id !== env.STRIPE_PRICE_ID) return 0;
  const invoiceId = id(sub.latest_invoice);
  if (!invoiceId) return 0;
  const invoice = await api.invoices.retrieve(invoiceId);
  if (invoice.status !== "paid" || invoice.livemode !== sub.livemode || invoice.currency !== "usd"
    || invoice.subtotal !== 300 || invoice.total_excluding_tax !== 300 || invoice.amount_paid !== invoice.total || invoice.total < 300
    || !invoice.automatic_tax.enabled || invoice.automatic_tax.status !== "complete"
    || id(invoice.customer) !== id(sub.customer) || id(invoice.parent?.subscription_details?.subscription) !== sub.id
    || invoice.lines.has_more || invoice.lines.data.length !== 1) return 0;
  const line = invoice.lines.data[0];
  if (id(line.pricing?.price_details?.price) !== env.STRIPE_PRICE_ID || line.amount !== 300) return 0;
  // A manually marked-paid/credit-balance invoice alone is not proof of a successful card payment.
  const payments = await api.invoicePayments.list({ invoice: invoice.id, status: "paid", limit: 100 });
  if (payments.has_more || payments.data.length !== 1) return 0;
  const payment = payments.data[0];
  if (payment.amount_paid !== invoice.amount_paid || payment.currency !== "usd" || payment.livemode !== sub.livemode || id(payment.invoice) !== invoice.id) return 0;
  let chargeId = id(payment.payment.charge);
  const intentId = id(payment.payment.payment_intent);
  if (intentId) {
    const intent = await api.paymentIntents.retrieve(intentId);
    if (intent.status !== "succeeded" || intent.amount_received !== invoice.amount_paid || intent.currency !== "usd" || intent.livemode !== sub.livemode) return 0;
    chargeId = id(intent.latest_charge);
  }
  if (!chargeId) return 0;
  const charge = await api.charges.retrieve(chargeId);
  if (!charge.paid || charge.status !== "succeeded" || charge.amount !== invoice.amount_paid || charge.currency !== "usd"
    || charge.amount_refunded > 0 || charge.disputed || charge.livemode !== sub.livemode || id(charge.customer) !== id(sub.customer)) return 0;
  const paidUntil = Math.min(item.current_period_end, line.period.end) * 1000;
  return Number.isSafeInteger(paidUntil) && paidUntil > Date.now() ? paidUntil : 0;
}
async function reconcile(env: BillingEnv, subscriptionId: string, api: Stripe, expectedAccountId?: string) {
  const known = await env.DB.prepare("SELECT account_id FROM billing_subscriptions WHERE subscription_id=? AND mode=?")
    .bind(subscriptionId, env.BILLING_MODE).first<{account_id: string}>();
  if (expectedAccountId && known && known.account_id !== expectedAccountId) throw new Error("unbound subscription");
  // Fence acquired BEFORE canonical fetch; overlapping stale responses cannot overwrite the newest owner.
  const fence = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO billing_reconciliation (subscription_id,mode,fence) VALUES (?,?,?)
    ON CONFLICT(subscription_id,mode) DO UPDATE SET fence=excluded.fence`)
    .bind(subscriptionId, env.BILLING_MODE, fence).run();
  const sub = await api.subscriptions.retrieve(subscriptionId);
  const owner = await env.DB.prepare("SELECT account_id, financial_hold FROM billing_customers WHERE customer_id=? AND mode=?")
    .bind(id(sub.customer), env.BILLING_MODE).first<{account_id: string; financial_hold: number}>();
  if (sub.id !== subscriptionId || !owner || sub.metadata.account_id !== owner.account_id
    || (expectedAccountId && owner.account_id !== expectedAccountId)
    || (known && owner.account_id !== known.account_id) || sub.livemode !== (env.BILLING_MODE === "live")) throw new Error("unbound subscription");
  const paidUntil = owner.financial_hold ? 0 : await verifiedPaidUntil(api, env, sub);
  await env.DB.prepare(`INSERT INTO billing_subscriptions
    (subscription_id,account_id,mode,price_id,status,paid_until,cancel_at_period_end,updated_at,fence)
    SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM billing_reconciliation WHERE subscription_id=? AND mode=? AND fence=?)
    ON CONFLICT(subscription_id) DO UPDATE SET price_id=excluded.price_id,status=excluded.status,paid_until=excluded.paid_until,
      cancel_at_period_end=excluded.cancel_at_period_end,updated_at=excluded.updated_at,fence=excluded.fence
    WHERE billing_subscriptions.account_id=excluded.account_id AND billing_subscriptions.mode=excluded.mode`)
    .bind(sub.id, owner.account_id, env.BILLING_MODE, env.STRIPE_PRICE_ID, sub.status, paidUntil, sub.cancel_at_period_end ? 1 : 0,
      Date.now(), fence, sub.id, env.BILLING_MODE, fence).run();
}
// Explicit, authenticated recovery for delayed webhooks. Never creates a Stripe
// customer, subscription, payment or fake event, and never clears financial holds.
export async function reconcileAccountBilling(env: BillingEnv, account: BillingAccount, api = stripe(env)): Promise<Response> {
  const owner = await env.DB.prepare("SELECT customer_id, financial_hold FROM billing_customers WHERE account_id=? AND mode=?")
    .bind(account.id, env.BILLING_MODE).first<Customer>();
  if (!owner) return response({ reconciled: false });
  if (owner.financial_hold) return fail("BILLING_REVIEW_REQUIRED", 409);
  const subscriptions = await api.subscriptions.list({ customer: owner.customer_id, status: "all", limit: 100 });
  if (subscriptions.object !== "list" || subscriptions.has_more !== false || !Array.isArray(subscriptions.data)) throw new Error("incomplete subscriptions");
  const ids = new Set<string>();
  for (const sub of subscriptions.data) {
    if (!/^sub_[A-Za-z0-9]+$/.test(sub.id) || ids.has(sub.id) || id(sub.customer) !== owner.customer_id
      || sub.livemode !== (env.BILLING_MODE === "live")) throw new Error("subscription context");
    ids.add(sub.id);
  }
  const known = await env.DB.prepare("SELECT subscription_id FROM billing_subscriptions WHERE account_id=? AND mode=? AND status='active'")
    .bind(account.id, env.BILLING_MODE).all<{subscription_id: string}>();
  const targets = new Set(known.results.map(row => row.subscription_id));
  for (const sub of subscriptions.data) {
    if (sub.metadata?.account_id === account.id && blockingStatuses.has(sub.status)) targets.add(sub.id);
  }
  // Bound provider work; ambiguous/missing history is not proof of payment.
  if (targets.size > 10 || [...targets].some(value => !ids.has(value))) throw new Error("subscription history");
  for (const value of targets) await reconcile(env, value, api, account.id);
  return response({ reconciled: true });
}
export async function processBillingEvent(env: BillingEnv, event: Stripe.Event, api = stripe(env)) {
  if (event.livemode !== (env.BILLING_MODE === "live")) throw new Error("event mode");
  if (await env.DB.prepare("SELECT event_id FROM billing_events WHERE mode=? AND event_id=?").bind(env.BILLING_MODE, event.id).first()) return;
  const object = event.data.object;
  const objectId = "id" in object && typeof object.id === "string" ? object.id : "";
  if (event.type.startsWith("customer.subscription.")) {
    await reconcile(env, objectId, api);
  } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed" || event.type === "invoice.voided" || event.type === "invoice.marked_uncollectible") {
    const invoice = await api.invoices.retrieve(objectId);
    const subscriptionId = id(invoice.parent?.subscription_details?.subscription);
    if (subscriptionId) await reconcile(env, subscriptionId, api);
  } else if (event.type === "charge.refunded" || event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
    const chargeId = event.type === "charge.refunded" ? objectId : id((object as Stripe.Dispute).charge);
    if (!chargeId) throw new Error("charge");
    const charge = await api.charges.retrieve(chargeId);
    // Conservative account hold. Never automatically remove a financial hold from an old paid event.
    if (charge.amount_refunded > 0 || charge.disputed || event.type === "charge.dispute.created") {
      await env.DB.prepare("UPDATE billing_customers SET financial_hold=1 WHERE customer_id=? AND mode=?")
        .bind(id(charge.customer), env.BILLING_MODE).run();
    }
  } else if (event.type === "checkout.session.completed") {
    const session = await api.checkout.sessions.retrieve(objectId);
    if (session.mode !== "subscription" || session.livemode !== event.livemode) throw new Error("session");
    const subscriptionId = id(session.subscription);
    if (subscriptionId) await reconcile(env, subscriptionId, api);
  }
  await env.DB.prepare("INSERT OR IGNORE INTO billing_events (mode,event_id,processed_at) VALUES (?,?,?)")
    .bind(env.BILLING_MODE, event.id, Date.now()).run();
}
async function webhook(request: Request, env: BillingEnv): Promise<Response> {
  if (!billingConfigured(env)) return fail("BILLING_NOT_CONFIGURED");
  const reader = request.body?.getReader();
  if (!reader) return fail("INVALID_WEBHOOK_SIGNATURE", 400);
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    length += part.value.length;
    if (length > 256000) { await reader.cancel(); return fail("PAYLOAD_TOO_LARGE", 413); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let event: Stripe.Event;
  try {
    event = await stripe(env).webhooks.constructEventAsync(new TextDecoder().decode(bytes), request.headers.get("stripe-signature") ?? "",
      env.STRIPE_WEBHOOK_SECRET!, 300, Stripe.createSubtleCryptoProvider());
  } catch { return fail("INVALID_WEBHOOK_SIGNATURE", 400); }
  if (event.livemode !== (env.BILLING_MODE === "live")) return fail("INVALID_BILLING_MODE", 400);
  try { await processBillingEvent(env, event); return response({ received: true }); }
  catch { return fail("WEBHOOK_PROCESSING_FAILED", 500); }
}
async function lease(request: Request, env: BillingEnv, account: BillingAccount): Promise<Response> {
  const row = await env.DB.prepare(`SELECT s.status,s.paid_until,s.cancel_at_period_end FROM billing_subscriptions s
    JOIN billing_customers c ON c.account_id=s.account_id AND c.mode=s.mode
    WHERE s.account_id=? AND s.mode=? AND s.price_id=? AND c.financial_hold=0 AND s.status='active' AND s.paid_until>?
    ORDER BY s.paid_until DESC LIMIT 1`).bind(account.id, env.BILLING_MODE, env.STRIPE_PRICE_ID, Date.now()).first<Qualification>();
  if (!row) return response({ error: "NOT_SUPPORTER", state: "free" }, 403);
  const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  if (!token) return fail("SESSION_EXPIRED", 401);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  const now = Math.floor(Date.now() / 1000);
  const claims = { audience: "tomonode-desktop", subject: account.id, sessionBinding: [...digest].map(b => b.toString(16).padStart(2,"0")).join(""),
    plan: "supporter", mode: env.BILLING_MODE, issuedAt: now, expiresAt: Math.min(now + 86400, Math.floor(row.paid_until / 1000)),
    paidUntil: Math.floor(row.paid_until / 1000), cancelAtPeriodEnd: !!row.cancel_at_period_end };
  const bytes = new TextEncoder().encode(JSON.stringify(claims));
  const key = await verifiedSigningKey(env);
  const signature = new Uint8Array(await crypto.subtle.sign("Ed25519", key, bytes));
  const encoded = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
  return response({ payload: encoded(bytes), signature: encoded(signature), keyId: "supporter-v1" });
}
export async function handleBilling(request: Request, env: BillingEnv,
  authenticate: () => Promise<BillingAccount | null>, rateLimit: (account: BillingAccount) => Promise<boolean>): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === "/v1/webhooks/stripe" && request.method === "POST") return webhook(request, env);
  if (!((request.method === "POST" && ["/v1/billing/checkout","/v1/billing/portal","/v1/billing/reconcile"].includes(path))
    || (request.method === "GET" && ["/v1/billing/status","/v1/membership/lease"].includes(path)))) return null;
  const account = await authenticate();
  if (!account) return fail("SESSION_EXPIRED", 401);
  if (path === "/v1/billing/status") return response({ enabled: billingConfigured(env), mode: env.BILLING_MODE ?? null, currency: "USD", monthlyAmount: 3 });
  if (!billingConfigured(env)) return fail("BILLING_NOT_CONFIGURED");
  if (!(await rateLimit(account))) return fail("RATE_LIMITED", 429);
  try {
    if (path === "/v1/membership/lease") return await lease(request, env, account);
    if (path === "/v1/billing/reconcile") return await reconcileAccountBilling(env, account);
    if (path === "/v1/billing/portal") return await portal(env, account);
    return await checkout(env, account);
  } catch { return fail("BILLING_UNAVAILABLE", 502); }
}
