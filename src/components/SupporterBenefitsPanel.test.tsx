import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupporterBenefitsPanel } from "./SupporterBenefitsPanel";
import { backend } from "../lib/backend";
import { supportConfig } from "../lib/supporterConfig";
import { openExternalUrl } from "./ExternalLinkHandler";
import type { MembershipView } from "../lib/membership";
vi.mock("./ExternalLinkHandler", () => ({ openExternalUrl: vi.fn() }));
vi.mock("../lib/i18n", () => ({ useI18n: () => ({ locale: "en" }) }));
const member: MembershipView = {plan:"free",state:"free",registeredCount:0,serverLimit:3,expiresAt:null,paidUntil:null,cancelAtPeriodEnd:false,theme:null,previewOptIn:false,billingEnabled:true};
beforeEach(() => {
  vi.spyOn(backend,"membershipStatus").mockResolvedValue(member);
  vi.spyOn(backend,"accountBillingStatus").mockResolvedValue({signedIn:true,enabled:true});
});
afterEach(() => { supportConfig.enabled=false; vi.restoreAllMocks(); vi.mocked(openExternalUrl).mockReset(); });
describe("Stripe billing actions", () => {
  it("does not open billing or grant benefits while production is disabled", async () => {
    const billing=vi.spyOn(backend,"accountBillingSession");
    render(<SupporterBenefitsPanel onAccount={vi.fn()} />);
    expect(screen.getByText("$3 / month + applicable tax")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Enrollment is being prepared"})).toBeDisabled();
    expect(billing).not.toHaveBeenCalled();
  });
  it("creates an authenticated Checkout and opens the returned URL only on click", async () => {
    supportConfig.enabled=true; const billing=vi.spyOn(backend,"accountBillingSession").mockResolvedValue("https://checkout.stripe.com/c/pay/test");
    render(<SupporterBenefitsPanel onAccount={vi.fn()} />);
    await waitFor(()=>expect(screen.getByRole("button",{name:"Subscribe with Stripe"})).toBeEnabled());
    expect(billing).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Subscribe with Stripe"}));
    await waitFor(()=>expect(openExternalUrl).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/test"));
    expect(billing).toHaveBeenCalledWith(false);
    expect(screen.getByText("Free plan")).toBeInTheDocument();
  });
  it("routes paid subscribers to Portal and keeps failures safe", async () => {
    supportConfig.enabled=true; vi.mocked(backend.membershipStatus).mockResolvedValue({...member,plan:"supporter",state:"verified",serverLimit:null});
    const billing=vi.spyOn(backend,"accountBillingSession").mockRejectedValue(new Error("unavailable"));
    render(<SupporterBenefitsPanel onAccount={vi.fn()} />);
    await waitFor(()=>expect(screen.getByRole("button",{name:"Manage subscription and payments"})).toBeEnabled());
    fireEvent.click(screen.getByRole("button",{name:"Manage subscription and payments"}));
    await waitFor(()=>expect(billing).toHaveBeenCalledWith(true));
    expect(openExternalUrl).not.toHaveBeenCalled();
    await screen.findByText(/Could not open billing/);
  });
  it("asks signed-out users to log in without creating a billing session", async () => {
    supportConfig.enabled=true; vi.mocked(backend.membershipStatus).mockResolvedValue({...member,state:"signed_out"});
    const billing=vi.spyOn(backend,"accountBillingSession"); const onAccount=vi.fn();
    render(<SupporterBenefitsPanel onAccount={onAccount} />);
    await screen.findByText("Not signed in");
    fireEvent.click(screen.getByRole("button",{name:"Sign in to view plans"}));
    expect(onAccount).toHaveBeenCalledOnce(); expect(billing).not.toHaveBeenCalled();
  });
  it("keeps checkout disabled when the API is disabled even if the build flag is enabled", async () => {
    supportConfig.enabled=true;
    vi.mocked(backend.accountBillingStatus).mockResolvedValue({signedIn:true,enabled:false});
    const billing=vi.spyOn(backend,"accountBillingSession");
    render(<SupporterBenefitsPanel onAccount={vi.fn()} />);
    await waitFor(()=>expect(screen.getByRole("button",{name:"Enrollment is being prepared"})).toBeDisabled());
    expect(billing).not.toHaveBeenCalled();
  });
  it("allows readiness retry after a network error without opening Stripe or granting benefits", async () => {
    supportConfig.enabled=true;
    vi.mocked(backend.accountBillingStatus).mockRejectedValue(new Error("private provider details"));
    const billing=vi.spyOn(backend,"accountBillingSession");
    render(<SupporterBenefitsPanel onAccount={vi.fn()} />);
    await screen.findByText(/Could not check billing availability/, {selector:"p"});
    expect(screen.queryByText(/private provider details/)).not.toBeInTheDocument();
    vi.mocked(backend.accountBillingStatus).mockResolvedValue({signedIn:true,enabled:true});
    fireEvent.click(screen.getByRole("button",{name:"Refresh membership status"}));
    await waitFor(()=>expect(screen.getByRole("button",{name:"Subscribe with Stripe"})).toBeEnabled());
    expect(billing).not.toHaveBeenCalled();
    expect(screen.getByText("Free plan")).toBeInTheDocument();
  });
  it("rechecks readiness on click and never creates a session after billing is switched off", async () => {
    supportConfig.enabled=true;
    const billing=vi.spyOn(backend,"accountBillingSession");
    render(<SupporterBenefitsPanel onAccount={vi.fn()} />);
    await waitFor(()=>expect(screen.getByRole("button",{name:"Subscribe with Stripe"})).toBeEnabled());
    vi.mocked(backend.accountBillingStatus).mockResolvedValue({signedIn:true,enabled:false});
    fireEvent.click(screen.getByRole("button",{name:"Subscribe with Stripe"}));
    await waitFor(()=>expect(screen.getByRole("button",{name:"Enrollment is being prepared"})).toBeDisabled());
    expect(billing).not.toHaveBeenCalled(); expect(openExternalUrl).not.toHaveBeenCalled();
  });
  it("requests login if the session expired immediately before purchase", async () => {
    supportConfig.enabled=true;
    const billing=vi.spyOn(backend,"accountBillingSession"); const onAccount=vi.fn();
    render(<SupporterBenefitsPanel onAccount={onAccount} />);
    await waitFor(()=>expect(screen.getByRole("button",{name:"Subscribe with Stripe"})).toBeEnabled());
    vi.mocked(backend.accountBillingStatus).mockResolvedValue({signedIn:false,enabled:false});
    fireEvent.click(screen.getByRole("button",{name:"Subscribe with Stripe"}));
    await waitFor(()=>expect(onAccount).toHaveBeenCalledOnce());
    expect(billing).not.toHaveBeenCalled();
  });
  it("coalesces rapid clicks and does not open Stripe after the panel is closed", async () => {
    supportConfig.enabled=true;
    let resolve!: (url: string) => void;
    const billing=vi.spyOn(backend,"accountBillingSession").mockReturnValue(new Promise(done=>{resolve=done;}));
    const view=render(<SupporterBenefitsPanel onAccount={vi.fn()} />);
    const button=await screen.findByRole("button",{name:"Subscribe with Stripe"});
    await waitFor(()=>expect(button).toBeEnabled());
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(()=>expect(billing).toHaveBeenCalledOnce());
    view.unmount(); resolve("https://checkout.stripe.com/c/pay/fixture");
    await Promise.resolve(); await Promise.resolve();
    expect(openExternalUrl).not.toHaveBeenCalled();
  });
  it("ignores a stale readiness result superseded by refresh", async () => {
    supportConfig.enabled=true;
    let resolve!: (status: {signedIn:boolean;enabled:boolean})=>void;
    vi.mocked(backend.accountBillingStatus).mockImplementation(()=>new Promise(done=>{resolve=done;}));
    render(<SupporterBenefitsPanel onAccount={vi.fn()} />);
    await screen.findByText("Free plan");
    await waitFor(()=>expect(backend.accountBillingStatus).toHaveBeenCalled());
    const stale=resolve;
    vi.mocked(backend.accountBillingStatus).mockResolvedValue({signedIn:true,enabled:false});
    fireEvent.click(screen.getByRole("button",{name:"Refresh membership status"}));
    await waitFor(()=>expect(screen.getByRole("button",{name:"Enrollment is being prepared"})).toBeDisabled());
    stale({signedIn:true,enabled:true});
    await Promise.resolve(); await Promise.resolve();
    expect(screen.getByRole("button",{name:"Enrollment is being prepared"})).toBeDisabled();
  });
});
