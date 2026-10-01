import { useState } from "react";
import { backend } from "../lib/backend";
import { memberThemes, previewFeatures, useMembership } from "../lib/membership";
import { useI18n, type AppLocale } from "../lib/i18n";
import { supporterText } from "../lib/supporterLocale";
import { supporterMembershipState, supporterPanelText, supporterThemeDescription } from "../lib/supporterPanelLocale";
import { formatSupportMonthlyAmount, supportConfig } from "../lib/supporterConfig";

export function SupporterBenefitsPanel({ onAccount, locale: localeOverride }: { onAccount: () => void; locale?: AppLocale }) {
  const { locale: preferredLocale } = useI18n();
  const locale = localeOverride ?? preferredLocale;
  const copy = supporterText(locale);
  const t = (key: Parameters<typeof supporterPanelText>[1], values: Record<string, string> = {}) => supporterPanelText(locale, key, values);
  const { member, error, refresh, changed } = useMembership();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const paid = member?.plan === "supporter";
  const count = member ? String(member.registeredCount) : t("countChecking");
  const limit = paid && member?.serverLimit === null ? t("unlimited") : t("serverLimit", { count: String(member?.serverLimit ?? supportConfig.freeServerLimit) });
  const apply = async (task: () => ReturnType<typeof backend.membershipSetTheme>) => {
    setBusy(true); setNotice("");
    try { changed(await task()); setNotice(t("saved")); }
    catch { setNotice(t("failed")); }
    finally { setBusy(false); }
  };
  return <section className="supporter-benefits">
    <span className="section-kicker">{t("kicker")}</span><h3>{copy.title}</h3><p>{copy.intro}</p>
    <div className="membership-summary" role="status"><strong>{paid ? t("supporterPlan") : t("freePlan")}</strong><span>{t("registeredCount", { count: `${count} / ${limit}` })}</span>
      {member?.paidUntil ? <span>{t("paidUntil", { date: new Date(member.paidUntil).toLocaleDateString(locale) })}</span> : null}
      {member?.cancelAtPeriodEnd ? <span>{t("cancellation")}</span> : null}
      <small>{member ? supporterMembershipState(locale, member.state) : t("stateChecking")}{error ? ` · ${t("refreshFailed")}` : ""}</small>
      <button type="button" disabled={busy} onClick={() => void refresh(true)}>{t("refresh")}</button>
    </div>
    <div className="plan-grid member-plan-grid"><article className="current"><h4>{t("freePlan")}</h4><strong>{t("freePrice")}</strong><ul>{copy.freeFeatures.map(item => <li key={item}>{item}</li>)}</ul></article>
      <article className="member-supporter-plan"><h4>{t("supporterPlan")}</h4><strong>{copy.monthlyPrice.replace("{amount}", formatSupportMonthlyAmount(locale))}</strong><ul>{copy.candidateFeatures.map(item => <li key={item}>{item}</li>)}</ul><p>{supportConfig.enabled ? copy.availableTitle : copy.pendingTitle}</p><p>{supportConfig.enabled ? copy.availableBody : copy.pendingBody}</p><button className="primary-button" type="button" disabled={!supportConfig.enabled || busy} onClick={onAccount}>{supportConfig.enabled ? copy.supportButton : t("productionPending")}</button></article></div>
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
