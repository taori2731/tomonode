import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { backend } from "../lib/backend";
import { I18nProvider } from "../lib/i18n";
import { previewAvailable, previewFeatures, useMembership, type MembershipView } from "../lib/membership";
import { SupporterBenefitsPanel } from "./SupporterBenefitsPanel";
const free: MembershipView={plan:"free",state:"signed_out",registeredCount:5,serverLimit:3,expiresAt:null,paidUntil:null,cancelAtPeriodEnd:false,theme:null,previewOptIn:false,billingEnabled:false};
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();localStorage.clear();});
describe("shared membership UI boundaries",()=>{
  it("grandfathered Free users keep existing operations but get no new wizard",async()=>{
    localStorage.setItem("server-hub:language:v1","ja");
    vi.spyOn(backend,"membershipStatus").mockResolvedValue(free);
    const create=vi.spyOn(backend,"createServer");
    render(<App/>); await screen.findByRole("heading",{name:"Survival World"});
    fireEvent.click(document.querySelector<HTMLButtonElement>(".titlebar .create")!);
    expect(await screen.findByRole("heading",{name:"Freeプランでは3個まで管理できます"})).toBeInTheDocument();
    expect(screen.getByText("現在の登録数：5 / 3個")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    expect(document.querySelector(".home-inspector .action-button")).not.toBeNull();
  });
  it("Free can inspect all three previews but not apply them or buy before activation",async()=>{
    localStorage.setItem("server-hub:language:v1","ja");vi.spyOn(backend,"membershipStatus").mockResolvedValue(free);
    const apply=vi.spyOn(backend,"membershipSetTheme");
    render(<I18nProvider><SupporterBenefitsPanel onAccount={vi.fn()}/></I18nProvider>);
    await screen.findByText("登録数：5 / 3個");
    const buttons=screen.getAllByRole("button",{name:"Supporter限定"});expect(buttons).toHaveLength(3);
    for(const button of buttons){expect(button).toBeDisabled();fireEvent.click(button);}
    expect(apply).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:"本番受付は準備中"})).toBeDisabled();
    expect(screen.getByText(/現在提供中の先行体験はありません/)).toBeInTheDocument();
  });
  it("restores standard appearance at signed expiry even if IPC stops responding",async()=>{
    vi.useFakeTimers();
    const view={...free,plan:"supporter" as const,state:"offline",theme:"midnight",previewOptIn:true,serverLimit:null,expiresAt:Date.now()+2000};
    vi.spyOn(backend,"membershipStatus").mockResolvedValue(view);
    const {result}=renderHook(()=>useMembership());await act(async()=>{await Promise.resolve();});
    expect(result.current.member?.theme).toBe("midnight");
    vi.mocked(backend.membershipStatus).mockRejectedValue(Error("IPC offline"));
    await act(async()=>{await result.current.refresh();});expect(result.current.member?.plan).toBe("supporter");
    await act(async()=>{vi.advanceTimersByTime(2100);});
    expect(result.current.member).toMatchObject({plan:"free",theme:null,previewOptIn:false,state:"expired"});
  });
  it("contains no invented candidate, and public features do not require payment",()=>{
    expect(previewFeatures).toHaveLength(0);
    expect(previewAvailable(free,{public:true})).toBe(true);
    expect(previewAvailable(free,{public:false})).toBe(false);
    expect(previewAvailable({...free,plan:"supporter",previewOptIn:false},{public:false})).toBe(false);
    expect(previewAvailable({...free,plan:"supporter",previewOptIn:true},{public:false})).toBe(true);
  });
});
