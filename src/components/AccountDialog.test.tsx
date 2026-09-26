import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountDialog } from "./AccountDialog";
import { backend } from "../lib/backend";
import type { AccountProfile } from "../lib/accountTypes";

const profile: AccountProfile = { email: "owner@example.com" };

describe("AccountDialog", () => {
  let originalDesktop: boolean;

  beforeEach(() => {
    originalDesktop = backend.isDesktop;
    backend.isDesktop = true;
    vi.spyOn(backend, "accountLoadSession").mockResolvedValue(null);
  });

  afterEach(() => {
    backend.isDesktop = originalDesktop;
    vi.restoreAllMocks();
  });

  it("signs in with an emailed code and can sign out", async () => {
    const requestCode = vi.spyOn(backend, "accountRequestCode").mockResolvedValue();
    const verifyCode = vi.spyOn(backend, "accountVerifyCode").mockResolvedValue(profile);
    const logout = vi.spyOn(backend, "accountLogout").mockResolvedValue();
    render(<AccountDialog locale="ja" onClose={() => undefined} />);

    fireEvent.change(await screen.findByLabelText("メールアドレス"), { target: { value: "owner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /確認コードを送る/ }));
    await waitFor(() => expect(requestCode).toHaveBeenCalledWith("owner@example.com"));
    expect(await screen.findByRole("status")).toHaveTextContent("確認コードを送りました： owner@example.com");

    fireEvent.change(await screen.findByLabelText("6桁の確認コード"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /確認してログイン/ }));
    await waitFor(() => expect(verifyCode).toHaveBeenCalledWith("owner@example.com", "123456"));
    expect(await screen.findByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ログアウト" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /会員|Stripe|支払|申込/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));
    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
    expect(await screen.findByText("ログアウトしました")).toBeInTheDocument();
    expect(screen.getByLabelText("メールアドレス")).toBeInTheDocument();
  });

  it("disables code delivery outside the installed desktop app", async () => {
    backend.isDesktop = false;
    render(<AccountDialog locale="ja" onClose={() => undefined} />);
    expect(await screen.findByLabelText("メールアドレス")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /確認コードを送る/ })).toBeDisabled();
    expect(screen.getByText(/インストール版Windowsアプリ/)).toBeInTheDocument();
  });
});
