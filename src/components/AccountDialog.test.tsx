import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backend } from "../lib/backend";
import { accountText } from "../lib/accountLocale";
import { accountSettingsText } from "../lib/accountSettingsLocale";
import type { AccountProfile } from "../lib/accountTypes";
import { AccountDialog } from "./AccountDialog";

const copy = accountText("ja");
const settingsCopy = accountSettingsText("ja");
const profile: AccountProfile = {
  email: "player@example.com",
  displayName: "Player001",
  hasPassword: true,
  avatarDataUrl: null,
};

let originalDesktop = false;

beforeEach(() => { originalDesktop = backend.isDesktop; });
afterEach(() => {
  backend.isDesktop = originalDesktop;
  vi.restoreAllMocks();
});

function renderAccount(onClose = vi.fn(), initialProfile: AccountProfile | null = profile, profileLoaded = true) {
  const onProfileChange = vi.fn();
  const rendered = render(<AccountDialog locale="ja" initialProfile={initialProfile} profileLoaded={profileLoaded} onProfileChange={onProfileChange} onClose={onClose} />);
  return { onClose, onProfileChange, unmount: rendered.unmount };
}

describe("AccountDialog", () => {
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
