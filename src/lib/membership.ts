import { useCallback, useEffect, useState } from "react";
import { backend } from "./backend";
import previewRegistry from "../../preview-features.json";

export interface MembershipView {
  plan: "free" | "supporter";
  state: string;
  registeredCount: number;
  serverLimit: number | null;
  expiresAt: number | null;
  paidUntil: number | null;
  cancelAtPeriodEnd: boolean;
  theme: string | null;
  previewOptIn: boolean;
  billingEnabled: boolean;
}
export interface DiscordEvents { started: boolean; stopped: boolean; crashed: boolean }
export interface DiscordView { registered: boolean; enabled: boolean; events: DiscordEvents; destinationId: string | null; lastResult: string }
export const memberThemes = [
  { id: "midnight", name: "Midnight Harbor", description: "深い青と澄んだ水色", background: "#0a162a", accent: "#79cefa" },
  { id: "orchid", name: "Quiet Orchid", description: "落ち着いた紫と柔らかなライラック", background: "#20182c", accent: "#d3b6ff" },
  { id: "ember", name: "Ember Studio", description: "墨色と温かな琥珀", background: "#251b16", accent: "#ffc184" },
] as const;
// No preview candidates have passed release readiness review yet. Public
// features are never moved into this registry, especially safety fixes.
export const previewFeatures: readonly { id: string; title: string; audience: string; impact: string; development: true; public: boolean }[] = previewRegistry;
export function previewAvailable(member: MembershipView | null, feature: { public: boolean }): boolean {
  return feature.public || !!member && member.plan === "supporter" && member.previewOptIn;
}
export function useMembership() {
  const [member, setMember] = useState<MembershipView | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async (force = false) => {
    // Test harnesses for unrelated screens can omit the optional new command.
    if (!backend.membershipStatus) return;
    try { setMember(await backend.membershipStatus(force)); setError(""); }
    catch { setError("会員資格の再確認に失敗しました。既存サーバーは引き続き利用できます。"); }
  }, []);
  useEffect(() => {
    void refresh();
    const update = () => { void refresh(); };
    const timer = window.setInterval(update, 20_000);
    const expiry = window.setInterval(() => setMember(current => current?.plan === "supporter" && current.expiresAt !== null && Date.now() >= current.expiresAt ? { ...current, plan: "free", state: "expired", theme: null, previewOptIn: false, serverLimit: 3 } : current), 1000);
    window.addEventListener("tomonode:membership-changed", update);
    return () => { window.clearInterval(timer); window.clearInterval(expiry); window.removeEventListener("tomonode:membership-changed", update); };
  }, [refresh]);
  const changed = (value: MembershipView) => { setMember(value); window.dispatchEvent(new Event("tomonode:membership-changed")); };
  return { member, error, refresh, changed };
}
