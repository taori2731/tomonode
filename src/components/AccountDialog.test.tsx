import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backend } from "../lib/backend";
import { accountText } from "../lib/accountLocale";
import type { AccountProfile } from "../lib/accountTypes";
import { AccountDialog } from "./AccountDialog";

const copy = accountText("ja");
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
  it("opens the signed-in profile as a compact popover and navigates to security and back", () => {
    renderAccount();

    const menu = screen.getByRole("dialog", { name: copy.profileSettings });
    expect(menu).toHaveClass("account-dialog-popover");
    expect(menu).toHaveTextContent(profile.displayName);
    expect(menu).toHaveTextContent(profile.email);
    expect(menu).toHaveTextContent(copy.freePlan);
    expect(screen.queryByRole("heading", { name: copy.title })).not.toBeInTheDocument();

    fireEvent.click(within(menu).getByRole("button", { name: copy.security }));
    const security = screen.getByRole("dialog", { name: copy.security });
    expect(security).not.toHaveClass("account-dialog-popover");
    expect(security).toHaveTextContent(profile.email);

    fireEvent.click(within(security).getByRole("button", { name: copy.profileSettings }));
    expect(screen.getByRole("dialog", { name: copy.profileSettings })).toHaveClass("account-dialog-popover");
  });

  it("lets a signed-in user edit their display name and synchronizes the profile change", async () => {
    backend.isDesktop = true;
    const updated = { ...profile, displayName: "New Player" };
    const updateName = vi.spyOn(backend, "accountUpdateDisplayName").mockResolvedValue(updated);
    const { onProfileChange } = renderAccount();
    const menu = screen.getByRole("dialog", { name: copy.profileSettings });

    fireEvent.click(within(menu).getByRole("button", { name: copy.edit }));
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
    expect(await screen.findByRole("dialog", { name: copy.profileSettings })).toHaveTextContent(profile.displayName);
  });

  it("closes on Escape and outside pointer input while keeping keyboard focus inside", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open account";
    document.body.append(trigger);
    trigger.focus();
    const { onClose, unmount } = renderAccount();
    const menu = screen.getByRole("dialog", { name: copy.profileSettings });
    expect(menu).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(within(menu).getByRole("button", { name: copy.signOut })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(document.querySelector(".account-profile-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(2);

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
