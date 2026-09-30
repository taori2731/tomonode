import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backend } from "../lib/backend";
import { accountText } from "../lib/accountLocale";
import { accountSettingsText } from "../lib/accountSettingsLocale";
import type { AccountBrowserAuthStart, AccountProfile } from "../lib/accountTypes";
import { openExternalUrl } from "./ExternalLinkHandler";
import { AccountDialog } from "./AccountDialog";

vi.mock("./ExternalLinkHandler", () => ({ openExternalUrl: vi.fn() }));

const copy = accountText("ja");
const settingsCopy = accountSettingsText("ja");
const profile: AccountProfile = {
  email: "player@example.com",
  displayName: "Player001",
  hasPassword: true,
  avatarDataUrl: null,
};
const browserAuthStart: AccountBrowserAuthStart = {
  browserUrl: "https://tomonode.site/account.html?request=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&mode=login&lang=ja",
  requestId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  userCode: "ABCD-EFGH",
  expiresInSeconds: 600,
  intervalSeconds: 3,
};

let originalDesktop = false;

beforeEach(() => { originalDesktop = backend.isDesktop; });
afterEach(() => {
  backend.isDesktop = originalDesktop;
  vi.restoreAllMocks();
  vi.mocked(openExternalUrl).mockReset();
});

function renderAccount(onClose = vi.fn(), initialProfile: AccountProfile | null = profile, profileLoaded = true) {
  const onProfileChange = vi.fn();
  const rendered = render(<AccountDialog locale="ja" initialProfile={initialProfile} profileLoaded={profileLoaded} onProfileChange={onProfileChange} onClose={onClose} />);
  return { onClose, onProfileChange, unmount: rendered.unmount };
}

describe("AccountDialog", () => {
  it("starts browser login from the signed-out dialog without native credential fields", async () => {
    backend.isDesktop = true;
    const startAuth = vi.spyOn(backend, "accountBrowserAuthStart").mockResolvedValue(browserAuthStart);
    vi.spyOn(backend, "accountBrowserAuthPoll").mockResolvedValue({ status: "pending", account: null });
    const cancelAuth = vi.spyOn(backend, "accountBrowserAuthCancel").mockResolvedValue(undefined);
    vi.mocked(openExternalUrl).mockResolvedValue(undefined);
    const { unmount } = renderAccount(vi.fn(), null, true);
    const dialog = screen.getByRole("dialog", { name: copy.title });

    expect(within(dialog).queryByLabelText(copy.email)).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(copy.password)).not.toBeInTheDocument();
    expect(dialog.querySelectorAll("input")).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: copy.browserAuthLogin }));

    expect(await within(dialog).findByLabelText(copy.browserAuthCode)).toHaveTextContent(browserAuthStart.userCode);
    expect(startAuth).toHaveBeenCalledWith(expect.any(String), "login", "ja");
    expect(openExternalUrl).toHaveBeenCalledWith(browserAuthStart.browserUrl);
    expect(within(dialog).getByRole("button", { name: copy.browserAuthReopen })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: copy.browserAuthCancel })).toBeInTheDocument();

    const clientAttemptId = startAuth.mock.calls[0]?.[0];
    unmount();
    await waitFor(() => expect(cancelAuth).toHaveBeenCalledWith(clientAttemptId));
  });

  it("re-enables browser login after a start failure so the user can retry", async () => {
    backend.isDesktop = true;
    const startAuth = vi.spyOn(backend, "accountBrowserAuthStart")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(browserAuthStart);
    vi.spyOn(backend, "accountBrowserAuthPoll").mockResolvedValue({ status: "pending", account: null });
    vi.spyOn(backend, "accountBrowserAuthCancel").mockResolvedValue(undefined);
    vi.mocked(openExternalUrl).mockResolvedValue(undefined);
    renderAccount(vi.fn(), null, true);
    fireEvent.click(screen.getByRole("button", { name: copy.browserAuthLogin }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: copy.browserAuthLogin })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: copy.browserAuthLogin }));

    expect(await screen.findByLabelText(copy.browserAuthCode)).toHaveTextContent(browserAuthStart.userCode);
    expect(startAuth).toHaveBeenCalledTimes(2);
  });

  it("finishes browser polling and publishes the signed-in profile", async () => {
    backend.isDesktop = true;
    vi.spyOn(backend, "accountBrowserAuthStart").mockResolvedValue(browserAuthStart);
    vi.spyOn(backend, "accountBrowserAuthPoll").mockResolvedValue({ status: "complete", account: profile });
    vi.mocked(openExternalUrl).mockResolvedValue(undefined);
    const { onProfileChange } = renderAccount(vi.fn(), null, true);

    fireEvent.click(screen.getByRole("button", { name: copy.browserAuthLogin }));

    expect(await screen.findByRole("dialog", { name: copy.accountSettings })).toHaveTextContent(profile.email);
    expect(onProfileChange).toHaveBeenCalledWith(profile);
    expect(backend.accountBrowserAuthPoll).toHaveBeenCalledWith(browserAuthStart.requestId);
  });

  it("cancels an active browser attempt and returns to the signed-out choices", async () => {
    backend.isDesktop = true;
    const startAuth = vi.spyOn(backend, "accountBrowserAuthStart").mockResolvedValue(browserAuthStart);
    vi.spyOn(backend, "accountBrowserAuthPoll").mockResolvedValue({ status: "pending", account: null });
    const cancelAuth = vi.spyOn(backend, "accountBrowserAuthCancel").mockResolvedValue(undefined);
    vi.mocked(openExternalUrl).mockResolvedValue(undefined);
    renderAccount(vi.fn(), null, true);
    fireEvent.click(screen.getByRole("button", { name: copy.browserAuthLogin }));
    await screen.findByLabelText(copy.browserAuthCode);
    const clientAttemptId = startAuth.mock.calls[0]?.[0];

    fireEvent.click(screen.getByRole("button", { name: copy.browserAuthCancel }));

    await waitFor(() => expect(cancelAuth).toHaveBeenCalledWith(clientAttemptId));
    expect(screen.getByRole("button", { name: copy.browserAuthLogin })).toBeInTheDocument();
    expect(screen.queryByLabelText(copy.browserAuthCode)).not.toBeInTheDocument();
  });

  it("offers an actionable retry after a poll failure", async () => {
    backend.isDesktop = true;
    vi.spyOn(backend, "accountBrowserAuthStart").mockResolvedValue(browserAuthStart);
    const pollAuth = vi.spyOn(backend, "accountBrowserAuthPoll")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ status: "pending", account: null });
    vi.mocked(openExternalUrl).mockResolvedValue(undefined);
    renderAccount(vi.fn(), null, true);
    fireEvent.click(screen.getByRole("button", { name: copy.browserAuthLogin }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: copy.browserAuthRetry })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: copy.browserAuthRetry }));

    await waitFor(() => expect(pollAuth).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens browser registration for password setup on a profile without a password", async () => {
    backend.isDesktop = true;
    const startAuth = vi.spyOn(backend, "accountBrowserAuthStart").mockResolvedValue({
      ...browserAuthStart,
      browserUrl: "https://tomonode.site/account.html?request=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&mode=register&lang=ja",
    });
    vi.spyOn(backend, "accountBrowserAuthPoll").mockResolvedValue({ status: "pending", account: null });
    vi.mocked(openExternalUrl).mockResolvedValue(undefined);
    const profileWithoutPassword = { ...profile, hasPassword: false };
    const { unmount } = renderAccount(vi.fn(), profileWithoutPassword, true);
    const settings = screen.getByRole("dialog", { name: copy.accountSettings });
    fireEvent.click(within(settings).getByRole("tab", { name: copy.security }));
    fireEvent.click(within(settings).getByRole("button", { name: new RegExp(copy.passwordChange) }));

    expect(await screen.findByLabelText(copy.browserAuthCode)).toHaveTextContent(browserAuthStart.userCode);
    expect(startAuth).toHaveBeenCalledWith(expect.any(String), "register", "ja");
    unmount();
  });

  it("opens the signed-in account as a three-tab settings dialog", () => {
    renderAccount();

    const menu = screen.getByRole("dialog", { name: copy.accountSettings });
    expect(menu).toHaveClass("account-settings-dialog");
    expect(menu).toHaveTextContent(profile.displayName);
    expect(menu).toHaveTextContent(profile.email);
    expect(within(menu).getAllByRole("tab")).toHaveLength(3);
    expect(within(menu).getByRole("tab", { name: settingsCopy.profileTab })).toHaveAttribute("aria-selected", "true");
    expect(within(menu).getByText(settingsCopy.userId)).toBeInTheDocument();

    fireEvent.click(within(menu).getByRole("tab", { name: copy.security }));
    expect(within(menu).getByRole("tab", { name: copy.security })).toHaveAttribute("aria-selected", "true");
    expect(within(menu).getAllByText(settingsCopy.currentDevice)).toHaveLength(2);
    expect(within(menu).getByRole("button", { name: new RegExp(copy.otherDeviceLogout) })).toBeDisabled();

    fireEvent.click(within(menu).getByRole("tab", { name: copy.plan }));
    expect(within(menu).getByRole("tab", { name: copy.plan })).toHaveAttribute("aria-selected", "true");
    expect(within(menu).getByText(settingsCopy.supporterPending)).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: new RegExp(copy.seePlans) })).toBeDisabled();
  });

  it("lets a signed-in user edit their display name and synchronizes the profile change", async () => {
    backend.isDesktop = true;
    const updated = { ...profile, displayName: "New Player" };
    const updateName = vi.spyOn(backend, "accountUpdateDisplayName").mockResolvedValue(updated);
    const { onProfileChange } = renderAccount();
    const menu = screen.getByRole("dialog", { name: copy.accountSettings });

    fireEvent.change(within(menu).getByRole("textbox", { name: copy.displayName }), { target: { value: updated.displayName } });
    fireEvent.click(within(menu).getByRole("button", { name: copy.saveProfile }));

    await waitFor(() => expect(updateName).toHaveBeenCalledWith(updated.displayName));
    expect(await within(menu).findByText(updated.displayName)).toBeInTheDocument();
    expect(onProfileChange).toHaveBeenCalledWith(updated);
  });

  it("keeps unresolved sessions in the anchored loading panel until the startup profile arrives", async () => {
    const { rerender } = render(<AccountDialog locale="ja" initialProfile={null} profileLoaded={false} onProfileChange={vi.fn()} onClose={vi.fn()} />);
    const checking = screen.getByRole("dialog", { name: copy.profileSettings });
    expect(checking).toHaveClass("account-dialog-popover");
    expect(within(checking).getByRole("status")).toHaveTextContent(copy.loading);
    expect(screen.queryByRole("heading", { name: copy.title })).not.toBeInTheDocument();

    rerender(<AccountDialog locale="ja" initialProfile={profile} profileLoaded={true} onProfileChange={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByRole("dialog", { name: copy.accountSettings })).toHaveTextContent(profile.displayName);
  });

  it("closes on Escape and outside pointer input while keeping keyboard focus inside", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open account";
    document.body.append(trigger);
    trigger.focus();
    const { onClose, unmount } = renderAccount();
    const menu = screen.getByRole("dialog", { name: copy.accountSettings });
    expect(menu).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(within(menu).getByRole("button", { name: copy.accountSettings })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(document.querySelector(".account-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(2);

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
