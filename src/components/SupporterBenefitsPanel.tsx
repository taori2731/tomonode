import { useEffect, useRef, useState } from "react";
import { backend } from "../lib/backend";
import { memberThemes, previewFeatures, useMembership } from "../lib/membership";
import { useI18n, type AppLocale } from "../lib/i18n";
import { supporterText } from "../lib/supporterLocale";
import { supporterMembershipState, supporterPanelText, supporterThemeDescription } from "../lib/supporterPanelLocale";
import { formatSupportMonthlyAmount, supportConfig } from "../lib/supporterConfig";
import { billingText } from "../lib/billingLocale";
import { openExternalUrl } from "./ExternalLinkHandler";
import type { AccountBillingStatus } from "../lib/accountTypes";

export function SupporterBenefitsPanel({ onAccount, locale: localeOverride }: { onAccount: () => void; locale?: AppLocale }) {
  const { locale: preferredLocale } = useI18n();
  const locale = localeOverride ?? preferredLocale;
  const copy = supporterText(locale);
  const billingCopy = billingText(locale);
  const t = (key: Parameters<typeof supporterPanelText>[1], values: Record<string, string> = {}) => supporterPanelText(locale, key, values);
  const { member, error, refresh, changed } = useMembership();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const statusRequest = useRef(0);
  const [billingStatus, setBillingStatus] = useState<AccountBillingStatus | null>(null);
  const [billingError, setBillingError] = useState(false);
  const [checkVersion, setCheckVersion] = useState(0);
  const memberState = member?.state;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; statusRequest.current += 1; };
  }, []);
  useEffect(() => {
    const request = ++statusRequest.current;
    setBillingStatus(null); setBillingError(false);
    if (!supportConfig.enabled) return;
    void backend.accountBillingStatus().then(status => {
      if (mounted.current && statusRequest.current === request) setBillingStatus(status);
    }).catch(() => {
      if (mounted.current && statusRequest.current === request) setBillingError(true);
    });
    return () => { if (statusRequest.current === request) statusRequest.current += 1; };
  }, [memberState, checkVersion]);
  const paid = member?.plan === "supporter";
  const signedOut = billingStatus?.signedIn === false || memberState === "signed_out" || memberState === "session_expired";
  const billingReady = supportConfig.enabled && billingStatus?.enabled === true && !signedOut;
  const billingLabel = !supportConfig.enabled ? t("productionPending") : signedOut ? billingCopy.login
    : billingError ? billingCopy.checkFailed : !billingStatus ? billingCopy.checking
    : billingReady ? paid ? billingCopy.manage : copy.supportButton : t("productionPending");
  const count = member ? String(member.registeredCount) : t("countChecking");
  const limit = paid && member?.serverLimit === null ? t("unlimited") : t("serverLimit", { count: String(member?.serverLimit ?? supportConfig.freeServerLimit) });
  const openBilling = async (portal: boolean) => {
    if (busyRef.current || !supportConfig.enabled) return;
    if (signedOut) { onAccount(); return; }
    if (!billingReady) return;
    busyRef.current = true;
    setBusy(true); setNotice("");
    try {
      // Re-read immediately before creating a session; readiness can change while this panel is open.
      statusRequest.current += 1;
      const status = await backend.accountBillingStatus();
      if (!mounted.current) return;
      setBillingStatus(status); setBillingError(false);
      if (!status.signedIn) { onAccount(); return; }
      if (!status.enabled) { setNotice(t("productionPending")); return; }
      const url = await backend.accountBillingSession(portal);
      if (!mounted.current) return;
      await openExternalUrl(url);
      setNotice(billingCopy.opened);
    } catch { if (mounted.current) setNotice(billingCopy.failed); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  const refreshAll = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setNotice("");
    statusRequest.current += 1; setBillingStatus(null); setBillingError(false);
    try { await refresh(true); }
    finally {
      busyRef.current = false;
      if (mounted.current) { setBusy(false); setCheckVersion(value => value + 1); }
    }
  };
  const apply = async (task: () => ReturnType<typeof backend.membershipSetTheme>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setNotice("");
    try { changed(await task()); setNotice(t("saved")); }
    catch { setNotice(t("failed")); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <section className="supporter-benefits">
    <span className="section-kicker">{t("kicker")}</span><h3>{copy.title}</h3><p>{copy.intro}</p>
    <div className="membership-summary" role="status"><strong>{paid ? t("supporterPlan") : t("freePlan")}</strong><span>{t("registeredCount", { count: `${count} / ${limit}` })}</span>
      {member?.paidUntil ? <span>{t("paidUntil", { date: new Date(member.paidUntil).toLocaleDateString(locale) })}</span> : null}
      {member?.cancelAtPeriodEnd ? <span>{t("cancellation")}</span> : null}
      <small>{member ? supporterMembershipState(locale, member.state) : t("stateChecking")}{error ? ` · ${t("refreshFailed")}` : ""}</small>
      <button type="button" disabled={busy} onClick={() => void refreshAll()}>{t("refresh")}</button>
    </div>
    <div className="plan-grid member-plan-grid"><article className="current"><h4>{t("freePlan")}</h4><strong>{t("freePrice")}</strong><ul>{copy.freeFeatures.map(item => <li key={item}>{item}</li>)}</ul></article>
      <article className="member-supporter-plan"><h4>{t("supporterPlan")}</h4><strong>{copy.monthlyPrice.replace("{amount}", formatSupportMonthlyAmount(locale))}</strong><ul>{copy.candidateFeatures.map(item => <li key={item}>{item}</li>)}</ul><p>{billingReady || (supportConfig.enabled && signedOut) ? copy.availableTitle : copy.pendingTitle}</p><p>{billingReady || (supportConfig.enabled && signedOut) ? copy.availableBody : copy.pendingBody}</p><button className="primary-button" type="button" disabled={busy || !supportConfig.enabled || (!signedOut && !billingReady)} onClick={() => void openBilling(paid)}>{billingLabel}</button>
      {billingError && supportConfig.enabled ? <p role="status">{billingCopy.unavailable}</p> : null}
      {billingReady && !paid ? <button type="button" disabled={busy} onClick={() => void openBilling(true)}>{billingCopy.manage}</button> : null}</article></div>
    <p>{copy.afterStoppingBody}</p><p>{t("unlimitedCaveat")}</p>
    <h4>{t("previewHeading")}</h4><label className="switch-row"><input type="checkbox" checked={member?.previewOptIn ?? false} disabled={!paid || busy} onChange={event => void apply(() => backend.membershipSetPreview(event.target.checked))} />{t("previewOptIn")}</label>
    {previewFeatures.length === 0 ? <p>{t("noPreviews")}</p> : previewFeatures.map(feature => <p key={feature.id}>{feature.title} · {t("previewItem", { audience: feature.audience, impact: feature.impact })}</p>)}
    <h4>{t("themeHeading")}</h4><p>{t("themeIntro")}</p>
    <div className="member-theme-grid">{memberThemes.map(theme => <article key={theme.id} style={{ background: theme.background, borderColor: theme.accent, color: "#f3f4f8" }}>
      <div className="member-theme-swatch" style={{ background: theme.accent }} aria-hidden="true" /><strong>{theme.name}</strong><p>{supporterThemeDescription(locale, theme.id)}</p><button type="button" disabled={!paid || busy} onClick={() => void apply(() => backend.membershipSetTheme(theme.id))}>{member?.theme === theme.id ? t("themeApplied") : paid ? t("applyTheme") : t("supporterOnly")}</button>
    </article>)}</div>
    <button type="button" disabled={busy || !member?.theme} onClick={() => void apply(() => backend.membershipSetTheme(null))}>{t("resetTheme")}</button>
    <p>{t("themeResetNote")}</p>
    {notice ? <p role="status">{notice}</p> : null}
  </section>;
}
