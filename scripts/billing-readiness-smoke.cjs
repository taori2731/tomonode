// Rendered UI acceptance with synthetic accounts. No Stripe/API request or real login.
const assert = require("node:assert/strict");
const {spawn} = require("node:child_process");
const {mkdirSync} = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {chromium} = require("playwright");
const root = path.resolve(__dirname, "..");
const base = "http://127.0.0.1:1471/";
const screenshots = path.join(os.tmpdir(), "tomonode-billing-readiness-qa");
const profile = {email:"purchase-qa@example.invalid",displayName:"Purchase QA",hasPassword:true,avatarDataUrl:null,userId:"synthetic-purchase-qa",createdAt:0};
const member = {plan:"free",state:"free",registeredCount:3,serverLimit:3,expiresAt:null,paidUntil:null,cancelAtPeriodEnd:false,theme:null,previewOptIn:false,billingEnabled:false};

async function main() {
  let browser,server;
  try {
    // Never reuse an unknown process from another checkout.
    try { await fetch(base); throw Error("Port 1471 is occupied; do not reuse it"); }
    catch(error) { if (!error.cause) throw error; }
    server=spawn(process.execPath,[path.join(root,"node_modules/vite/bin/vite.js"),"--port","1471","--host","127.0.0.1","--strictPort"],{cwd:root,windowsHide:true,stdio:"ignore"});
    let ready=false;
    for(let attempt=0;attempt<80;attempt++) {
      try { ready=(await fetch(base)).ok; if(ready)break; } catch {}
      await new Promise(done=>setTimeout(done,100));
    }
    assert.ok(ready,"Dedicated QA server did not start");
    mkdirSync(screenshots,{recursive:true});
    browser=await chromium.launch({headless:true,channel:"chrome"});
    const checks=[];
    for(const scenario of ["disabled","signed-out","unavailable","checkout","portal","switched-off"]) {
      const page=await browser.newPage({viewport:{width:1680,height:940},locale:"en-US"});
      const errors=[],remote=[];
      page.on("pageerror",error=>errors.push(error.message));
      page.on("console",message=>{if(["error","warning"].includes(message.type()))errors.push(message.text());});
      await page.addInitScript(({scenario,member,profile})=>{
        localStorage.setItem("server-hub:language:v1","en");
        localStorage.setItem("server-hub:theme:v1","dark");
        window.__billingQa={scenario,member:scenario==="portal"?{...member,plan:"supporter",state:"verified",serverLimit:null}:scenario==="signed-out"?{...member,state:"signed_out"}:member,profile:scenario==="signed-out"?null:profile,calls:[],opened:[],statusCalls:0};
      },{scenario,member,profile});
      await page.route("https://tomonode-account-api.rafaerunacaya27.workers.dev/**",route=>{remote.push(route.request().url());return route.abort();});
      await page.route(/\/src\/lib\/supporterConfig\.ts(?:\?.*)?$/,async route=>{
        const response=await route.fetch(),source=await response.text();
        assert.ok(source.includes("enabled: false,"));
        await route.fulfill({response,body:source.replace("enabled: false,","enabled: true,")});
      });
      await page.route(/\/src\/lib\/backend\.ts(?:\?.*)?$/,async route=>{
        const response=await route.fetch(),source=await response.text();
        await route.fulfill({response,body:source+`
backend.accountLoadSession=async()=>window.__billingQa.profile;
backend.isDesktop=true;
backend.membershipStatus=async()=>window.__billingQa.member;
backend.accountBillingStatus=async()=>{const qa=window.__billingQa;qa.statusCalls++;if(qa.scenario==='unavailable')throw Error('fixture-network-error');return {signedIn:qa.scenario!=='signed-out',enabled:!['disabled','signed-out','switched-off'].includes(qa.scenario)};};
backend.accountBillingSession=async(portal)=>{window.__billingQa.calls.push(portal);return portal?'https://billing.stripe.com/p/session/fixture':'https://checkout.stripe.com/c/pay/fixture';};
backend.accountBrowserAuthStart=async()=>({browserUrl:'https://tomonode.site/account.html?request=0123456789abcdef0123456789abcdef&mode=login&lang=en',requestId:'0123456789abcdef0123456789abcdef',userCode:'ABCD-2345',expiresInSeconds:600,intervalSeconds:1});
backend.accountBrowserAuthPoll=async()=>{const qa=window.__billingQa;qa.scenario='checkout';qa.member={...qa.member,state:'free'};qa.profile=${JSON.stringify(profile)};return {status:'complete',account:qa.profile};};
`});
      });
      await page.route(/\/src\/components\/ExternalLinkHandler\.tsx(?:\?.*)?$/,async route=>{
        const response=await route.fetch(),source=await response.text();
        const marker="const url = new URL(value, window.location.href);";
        assert.ok(source.includes(marker));
        await route.fulfill({response,body:source.replace(marker,"window.__billingQa.opened.push(value); return; "+marker)});
      });
      await page.goto(base,{waitUntil:"networkidle"});
      assert.equal(await page.title(),"TomoNode");
      assert.equal(await page.locator("vite-error-overlay").count(),0);
      const migration=page.locator(".migration-notice-backdrop");
      if(await migration.isVisible())await migration.getByRole("button").click();
      await page.locator(".sidebar-footer").getByRole("button",{name:"Settings",exact:true}).click();
      const dialog=page.locator(".app-settings-dialog");
      await dialog.getByRole("button",{name:"Support TomoNode",exact:true}).click();
      const panel=dialog.locator(".supporter-benefits");
      await panel.getByRole("heading",{name:"Supporter",exact:true}).waitFor();
      if(scenario==="disabled") {
        const button=panel.getByRole("button",{name:"Enrollment is being prepared"});
        await button.waitFor(); assert.ok(await button.isDisabled());
      } else if(scenario==="signed-out") {
        await panel.getByRole("button",{name:"Sign in to view plans"}).click();
        await page.locator(".account-dialog").waitFor();
        await dialog.waitFor({state:"detached"});
        assert.equal(await page.locator(".app-settings-dialog").count(),0);
        await page.getByRole("dialog").waitFor();
        await page.getByRole("button",{name:"Sign in in browser",exact:true}).click();
        await dialog.getByRole("heading",{name:"Support TomoNode",exact:true}).waitFor();
        await panel.getByRole("button",{name:"Subscribe with Stripe",exact:true}).waitFor();
      } else if(scenario==="unavailable") {
        await panel.getByText("Could not check billing availability. Refresh membership to try again.",{exact:true}).waitFor();
        assert.ok(await panel.getByRole("button",{name:"Could not check availability",exact:true}).isDisabled());
        await panel.getByRole("button",{name:"Could not check availability",exact:true}).scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(screenshots,"billing-readiness-error.png")});
        await page.evaluate(()=>{window.__billingQa.scenario="checkout";});
        await panel.getByRole("button",{name:"Refresh membership status"}).click();
        await panel.getByRole("button",{name:"Subscribe with Stripe"}).waitFor();
      } else if(scenario==="switched-off") {
        await page.evaluate(()=>{window.__billingQa.scenario="checkout";});
        await panel.getByRole("button",{name:"Refresh membership status"}).click();
        const button=panel.getByRole("button",{name:"Subscribe with Stripe"});
        await button.waitFor();
        await page.evaluate(()=>{window.__billingQa.scenario="switched-off";});
        await button.click();
        await panel.getByRole("button",{name:"Enrollment is being prepared"}).waitFor();
      } else {
        await panel.getByRole("button",{name:scenario==="portal"?"Manage subscription and payments":"Subscribe with Stripe",exact:true}).click();
        const notice=panel.getByText("Stripe opened in your browser. Refresh membership after payment.",{exact:true});
        await notice.waitFor(); await notice.scrollIntoViewIfNeeded();
      }
      const state=await page.evaluate(()=>({calls:window.__billingQa.calls,opened:window.__billingQa.opened}));
      assert.deepEqual(state.calls,scenario==="portal"?[true]:scenario==="checkout"?[false]:[]);
      assert.equal(state.opened.length,["checkout","portal","signed-out"].includes(scenario)?1:0);
      assert.deepEqual(errors,[]); assert.deepEqual(remote,[]);
      assert.ok((await page.locator("body").innerText()).includes("TomoNode"));
      await page.screenshot({path:path.join(screenshots,`billing-${scenario}.png`)});
      if(scenario==="unavailable") {
        await page.setViewportSize({width:390,height:844});
        await panel.getByRole("button",{name:"Subscribe with Stripe",exact:true}).scrollIntoViewIfNeeded();
        const bounds=await dialog.boundingBox();
        assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=391,"Mobile dialog overflows");
        const buttonBounds=await panel.getByRole("button",{name:"Subscribe with Stripe",exact:true}).boundingBox();
        assert.ok(buttonBounds&&buttonBounds.x>=0&&buttonBounds.x+buttonBounds.width<=391,"Mobile billing button overflows");
        await page.screenshot({path:path.join(screenshots,"billing-mobile.png")});
      }
      checks.push({scenario,pass:true,pageIdentity:true,notBlank:true,noOverlay:true,consoleErrors:errors.length,remoteBillingRequests:remote.length});
      await page.close();
    }
    console.log(JSON.stringify({browserPath:"Browser plugin not available; repository Playwright",url:base,screenshots,checks},null,2));
  } finally { await browser?.close(); server?.kill(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
