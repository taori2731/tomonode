import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as backendModule from "../lib/backend";
import { backend } from "../lib/backend";
import { I18nProvider } from "../lib/i18n";
import type { DiscordView, MembershipView } from "../lib/membership";
import type { ServerProfile } from "../types";
import { DiscordNotificationPanel } from "./DiscordNotificationPanel";

const server = { id: "server-1", name: "QA server" } as ServerProfile;
const secondServer = { id: "server-2", name: "Another server" } as ServerProfile;
const supporter: MembershipView = { plan: "supporter", state: "verified", registeredCount: 1, serverLimit: null, expiresAt: null, paidUntil: null, cancelAtPeriodEnd: false, theme: null, previewOptIn: false, billingEnabled: false };
const free: MembershipView = { ...supporter, plan: "free", state: "free", registeredCount: 1, serverLimit: 3 };
const defaultMentions = { enabled: true, mode: "everyone" as const, roleId: "" };

function makeView(overrides: Partial<DiscordView> = {}): DiscordView {
  return {
    registered: true,
    enabled: false,
    events: { started: false, stopped: false, crashed: false },
    mentions: defaultMentions,
    destinationId: "destination-generation",
    lastResult: "not_sent",
    ...overrides,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function renderPanel(servers = [server]) {
  return render(<I18nProvider><DiscordNotificationPanel servers={servers} /></I18nProvider>);
}
function setMembership(value: MembershipView) {
  vi.mocked(backend.membershipStatus).mockResolvedValue(value);
}

beforeEach(() => {
  localStorage.setItem("server-hub:language:v1", "ja");
  vi.spyOn(backend, "membershipStatus").mockResolvedValue(supporter);
  vi.spyOn(backend, "discordSetLocale").mockResolvedValue(undefined);
  vi.spyOn(backend, "discordStatus").mockResolvedValue(makeView());
  vi.spyOn(backend, "discordSaveDestination").mockResolvedValue(makeView({ registered: true, destinationId: "saved-generation" }));
  vi.spyOn(backend, "discordSetNotifications").mockImplementation(async (_serverId, enabled, events, mentions) => makeView({ enabled, events, mentions }));
  vi.spyOn(backend, "discordDeleteDestination").mockResolvedValue(makeView({ registered: false, enabled: false, destinationId: null }));
  vi.spyOn(backend, "discordTestNotification").mockResolvedValue(makeView({ enabled: true, lastResult: "queued" }));
  vi.spyOn(backendModule, "confirmDanger").mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("Discord notification controls", () => {
  it("defaults new destinations to enabled @everyone mentions, but leaves notifications off", async () => {
    vi.mocked(backend.discordStatus).mockResolvedValue(makeView({ registered: false, destinationId: null, mentions: defaultMentions }));
    renderPanel();
    expect(await screen.findByRole("heading", { name: "Discord運営通知" })).toBeInTheDocument();
    expect(await screen.findByText("通知先を保存すると、メンション設定（初期設定：あり・@everyone）を確認できます。")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "このサーバーの通知を有効化" })).toBeDisabled();
  });

  it("requires an explicit confirmation naming the selected target before enabling", async () => {
    const initial = makeView();
    vi.mocked(backend.discordStatus).mockResolvedValue(initial);
    renderPanel();
    const toggle = await screen.findByRole("checkbox", { name: "このサーバーの通知を有効化" });
    await waitFor(() => expect(backend.discordSetLocale).toHaveBeenCalledWith("ja"));
    fireEvent.click(toggle);
    await waitFor(() => expect(backend.discordSetNotifications).toHaveBeenCalledOnce());
    expect(backendModule.confirmDanger).toHaveBeenCalledWith(expect.stringContaining("メンション対象：@everyone"));
    expect(backend.discordSetNotifications).toHaveBeenCalledWith("server-1", true, initial.events, defaultMentions, true);
  });

  it("does not enable test or actions against an unsaved mention draft; saves the exact draft while stopping", async () => {
    vi.mocked(backend.discordStatus).mockResolvedValue(makeView({ enabled: true }));
    renderPanel();
    const mentionToggle = await screen.findByRole("checkbox", { name: "メンションを追加（初期設定：あり）" });
    fireEvent.click(mentionToggle);
    expect(screen.getByRole("button", { name: "テスト通知を送信" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "メンション設定を保存" }));
    await waitFor(() => expect(backend.discordSetNotifications).toHaveBeenCalledWith(
      "server-1",
      false,
      { started: false, stopped: false, crashed: false },
      { enabled: false, mode: "everyone", roleId: "" },
      true,
    ));
    expect(backendModule.confirmDanger).toHaveBeenCalledWith(expect.stringContaining("新しい対象：メンションなし"));
  });

  it("confirms an @here draft explicitly and sends only that saved selection to the native bridge", async () => {
    vi.mocked(backend.discordStatus).mockResolvedValue(makeView());
    renderPanel();
    fireEvent.change(await screen.findByLabelText("対象"), { target: { value: "here" } });
    fireEvent.click(screen.getByRole("button", { name: "メンション設定を保存" }));
    await waitFor(() => expect(backend.discordSetNotifications).toHaveBeenCalledWith(
      "server-1",
      false,
      { started: false, stopped: false, crashed: false },
      { enabled: true, mode: "here", roleId: "" },
      true,
    ));
    expect(backendModule.confirmDanger).toHaveBeenCalledWith(expect.stringContaining("新しい対象：@here（オンライン対象）"));
  });

  it("clears a destination URL before confirmation and does not save when canceled", async () => {
    vi.mocked(backend.discordStatus).mockResolvedValue(makeView({ registered: false, destinationId: null }));
    vi.mocked(backendModule.confirmDanger).mockResolvedValue(false);
    renderPanel();
    const urlInput = await screen.findByLabelText("新しいWebhook URL") as HTMLInputElement;
    const fakeUrl = "https://discord.com/api/webhooks/123456789012345678/fake-placeholder-only";
    fireEvent.change(urlInput, { target: { value: fakeUrl } });
    fireEvent.click(screen.getByRole("button", { name: "通知先を保存・置き換え" }));
    expect(urlInput).toHaveValue("");
    expect(backendModule.confirmDanger).toHaveBeenCalledWith(expect.not.stringContaining(fakeUrl));
    await waitFor(() => expect(backend.discordSaveDestination).not.toHaveBeenCalled());
  });

  it("allows saving an empty role draft while stopped but refuses to enable it", async () => {
    vi.mocked(backend.discordStatus).mockResolvedValue(makeView());
    renderPanel();
    fireEvent.change(await screen.findByLabelText("対象"), { target: { value: "role" } });
    fireEvent.click(screen.getByRole("button", { name: "メンション設定を保存" }));
    await waitFor(() => expect(backend.discordSetNotifications).toHaveBeenCalledWith(
      "server-1",
      false,
      { started: false, stopped: false, crashed: false },
      { enabled: true, mode: "role", roleId: "" },
      true,
    ));
    const countBeforeEnable = vi.mocked(backend.discordSetNotifications).mock.calls.length;
    fireEvent.click(screen.getByRole("checkbox", { name: "このサーバーの通知を有効化" }));
    expect(await screen.findByText("指定ロールのIDを入力してから有効化してください")).toBeInTheDocument();
    expect(backend.discordSetNotifications).toHaveBeenCalledTimes(countBeforeEnable);
  });

  it("holds the action lock while confirmation is pending and cancellation makes no IPC call", async () => {
    let decide!: (accepted: boolean) => void;
    vi.mocked(backendModule.confirmDanger).mockImplementation(() => new Promise((resolve) => { decide = resolve; }));
    renderPanel();
    const toggle = await screen.findByRole("checkbox", { name: "このサーバーの通知を有効化" });
    fireEvent.click(toggle);
    await waitFor(() => expect(backendModule.confirmDanger).toHaveBeenCalledOnce());
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(backendModule.confirmDanger).toHaveBeenCalledOnce();
    decide(false);
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(backend.discordSetNotifications).not.toHaveBeenCalled();
  });

  it("releases the action lock if the selected server disappears while confirmation is open", async () => {
    let decide!: (accepted: boolean) => void;
    vi.mocked(backendModule.confirmDanger).mockImplementation(() => new Promise((resolve) => { decide = resolve; }));
    const { rerender } = renderPanel([server, secondServer]);
    fireEvent.click(await screen.findByRole("checkbox", { name: "このサーバーの通知を有効化" }));
    await waitFor(() => expect(backendModule.confirmDanger).toHaveBeenCalledOnce());
    rerender(<I18nProvider><DiscordNotificationPanel servers={[secondServer]} /></I18nProvider>);
    await waitFor(() => expect(screen.getByLabelText("対象サーバー")).toHaveValue("server-2"));
    decide(false);
    await waitFor(() => expect(screen.getByLabelText("対象サーバー")).not.toBeDisabled());
    expect(backend.discordSetNotifications).not.toHaveBeenCalled();
  });

  it("keeps a free user able to stop an existing destination without enabling or testing", async () => {
    setMembership(free);
    vi.mocked(backend.discordStatus).mockResolvedValue(makeView({ enabled: true }));
    renderPanel();
    const toggle = await screen.findByRole("checkbox", { name: "このサーバーの通知を有効化" });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    await waitFor(() => expect(backend.discordSetNotifications).toHaveBeenCalledWith(
      "server-1", false, expect.any(Object), defaultMentions, false,
    ));
    expect(screen.getByRole("button", { name: "テスト通知を送信" })).toBeDisabled();
  });

  it("blocks delivery until the app locale synchronizes successfully", async () => {
    vi.mocked(backend.discordSetLocale).mockRejectedValue(new Error("IPC unavailable"));
    renderPanel();
    const toggle = await screen.findByRole("checkbox", { name: "このサーバーの通知を有効化" });
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((alert) => alert.textContent?.includes("選択したアプリ言語を通知へ同期できませんでした"))).toBe(true);
    expect(toggle).toBeDisabled();
    expect(screen.getByRole("button", { name: "テスト通知を送信" })).toBeDisabled();
    expect(backend.discordSetNotifications).not.toHaveBeenCalled();
    expect(backend.discordTestNotification).not.toHaveBeenCalled();
  });

  it("ignores a late status response after switching servers", async () => {
    const oldResponse = deferred<DiscordView>();
    const selectedResponse = deferred<DiscordView>();
    vi.mocked(backend.discordStatus).mockImplementation((serverId) => serverId === "server-1" ? oldResponse.promise : selectedResponse.promise);
    renderPanel([server, secondServer]);
    await screen.findByRole("heading", { name: "Discord運営通知" });
    fireEvent.change(screen.getByLabelText("対象サーバー"), { target: { value: "server-2" } });
    selectedResponse.resolve(makeView({ registered: false, destinationId: null }));
    const unconfigured = await screen.findByText((_content, element) => element?.textContent === "通知先: 未設定");
    expect(unconfigured).toBeInTheDocument();
    oldResponse.resolve(makeView({ registered: true }));
    await waitFor(() => expect(screen.getByText((_content, element) => element?.textContent === "通知先: 未設定")).toBeInTheDocument());
  });
});
