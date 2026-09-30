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
  userId: "b2807b4e-25af-4cd4-8c15-d324437e9bce",
  email: "player@example.com",
  displayName: "Player001",
  hasPassword: true,
  avatarDataUrl: null,
  createdAt: 1790726400000,
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

  it("routes email change for an account without a password to browser password setup", async () => {
    backend.isDesktop = true;
    const startAuth = vi.spyOn(backend, "accountBrowserAuthStart").mockResolvedValue({
      ...browserAuthStart,
      browserUrl: "https://tomonode.site/account.html?request=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&mode=register&lang=ja",
    });
    vi.spyOn(backend, "accountBrowserAuthPoll").mockResolvedValue({ status: "pending", account: null });
    vi.mocked(openExternalUrl).mockResolvedValue(undefined);
    renderAccount(vi.fn(), { ...profile, hasPassword: false }, true);
    const settings = screen.getByRole("dialog", { name: copy.accountSettings });

    fireEvent.click(within(settings).getByRole("button", { name: copy.emailChange }));
    expect(within(settings).getByText(settingsCopy.emailChangePasswordRequired)).toBeInTheDocument();
    fireEvent.click(within(settings).getByRole("button", { name: copy.enroll }));

    expect(await screen.findByLabelText(copy.browserAuthCode)).toHaveTextContent(browserAuthStart.userCode);
    expect(startAuth).toHaveBeenCalledWith(expect.any(String), "register", "ja");
  });

  it("opens the signed-in account as a three-tab settings dialog", async () => {
    renderAccount();

    const menu = screen.getByRole("dialog", { name: copy.accountSettings });
    expect(menu).toHaveClass("account-settings-dialog");
    expect(menu).toHaveTextContent(profile.displayName);
    expect(menu).toHaveTextContent(profile.email);
    expect(within(menu).getAllByRole("tab")).toHaveLength(3);
    expect(within(menu).getByRole("tab", { name: settingsCopy.profileTab })).toHaveAttribute("aria-selected", "true");
    expect(within(menu).getByText(settingsCopy.userId)).toBeInTheDocument();
    expect(within(menu).getByText(profile.userId!)).toBeInTheDocument();
    expect(within(menu).getByText(settingsCopy.accountCreated).closest(".account-settings-field")).toHaveTextContent(
      new Intl.DateTimeFormat("ja", { dateStyle: "medium" }).format(profile.createdAt!),
    );
    const copyId = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    fireEvent.click(within(menu).getByRole("button", { name: settingsCopy.copyUserId }));
    expect(copyId).toHaveBeenCalledWith(profile.userId);
    expect(await within(menu).findByRole("status")).toHaveTextContent(settingsCopy.userIdCopied);
    expect(within(menu).queryByText(copy.devices)).not.toBeInTheDocument();
    expect(within(menu).queryByText(copy.otherDeviceLogout)).not.toBeInTheDocument();
    expect(within(menu).queryByText(copy.autoLogin)).not.toBeInTheDocument();
    expect(within(menu).queryByText(copy.dataCollection)).not.toBeInTheDocument();
    expect(within(menu).queryByText(copy.privacy)).not.toBeInTheDocument();

    fireEvent.click(within(menu).getByRole("tab", { name: copy.security }));
    expect(within(menu).getByRole("tab", { name: copy.security })).toHaveAttribute("aria-selected", "true");
    expect(within(menu).queryByText(copy.devices)).not.toBeInTheDocument();
    expect(within(menu).queryByText(copy.deviceLoginActive)).not.toBeInTheDocument();
    expect(within(menu).getByText(copy.deleteAccount)).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: copy.preparing })).toBeDisabled();

    fireEvent.click(within(menu).getByRole("tab", { name: copy.plan }));
    expect(within(menu).getByRole("tab", { name: copy.plan })).toHaveAttribute("aria-selected", "true");
    expect(within(menu).getByText(settingsCopy.supporterPending)).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: new RegExp(copy.seePlans) })).toBeDisabled();
  });

  it("requests email change from Profile and Security without changing the active profile email", async () => {
    backend.isDesktop = true;
    const requestEmailChange = vi.spyOn(backend, "accountRequestEmailChange")
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("INVALID_CREDENTIALS"));
    const { onProfileChange } = renderAccount();
    const menu = screen.getByRole("dialog", { name: copy.accountSettings });

    fireEvent.click(within(menu).getByRole("button", { name: copy.emailChange }));
    fireEvent.change(within(menu).getByRole("textbox", { name: settingsCopy.emailChangeNewEmail }), { target: { value: "new@example.com" } });
    fireEvent.change(within(menu).getByLabelText(settingsCopy.emailChangeCurrentPassword), { target: { value: "current-pass" } });
    fireEvent.click(within(menu).getByRole("button", { name: settingsCopy.emailChangeSend }));

    expect(await within(menu).findByText(settingsCopy.emailChangeRequested)).toBeInTheDocument();
    expect(requestEmailChange).toHaveBeenNthCalledWith(1, "new@example.com", "current-pass");
    expect(onProfileChange).not.toHaveBeenCalled();
    expect(within(menu).getByLabelText(settingsCopy.emailChangeCurrentPassword)).toHaveValue("");

    fireEvent.click(within(menu).getByRole("tab", { name: copy.security }));
    fireEvent.click(within(menu).getByRole("button", { name: copy.emailChange }));
    fireEvent.change(within(menu).getByRole("textbox", { name: settingsCopy.emailChangeNewEmail }), { target: { value: "another@example.com" } });
    fireEvent.change(within(menu).getByLabelText(settingsCopy.emailChangeCurrentPassword), { target: { value: "wrong-pass" } });
    fireEvent.click(within(menu).getByRole("button", { name: settingsCopy.emailChangeSend }));

    expect(await within(menu).findByRole("alert")).toHaveTextContent("INVALID_CREDENTIALS");
    expect(requestEmailChange).toHaveBeenNthCalledWith(2, "another@example.com", "wrong-pass");
    fireEvent.click(within(menu).getByRole("button", { name: settingsCopy.emailChangeCancel }));
    expect(within(menu).getByText(profile.email)).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("button", { name: copy.emailChange }));
    expect(within(menu).getByLabelText(settingsCopy.emailChangeCurrentPassword)).toHaveValue("");
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
    expect(within(menu).getByRole("button", { name: settingsCopy.copyUserId })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(document.querySelector(".account-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(2);

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
