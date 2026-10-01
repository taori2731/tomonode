import { useState } from "react";
import { backend } from "../lib/backend";
import { memberThemes, previewFeatures, useMembership } from "../lib/membership";
import { useI18n, type AppLocale } from "../lib/i18n";
import { supporterText } from "../lib/supporterLocale";
import { formatSupportMonthlyAmount, supportConfig } from "../lib/supporterConfig";
const membershipStates: Record<string,string> = { signed_out:"ログインしていません", session_expired:"ログインの有効期限が切れています", not_configured:"会員資格の接続準備中", free:"Freeプラン", verified:"会員資格を確認済み", offline:"オフライン資格で利用中（最長24時間・契約期間内）", unavailable:"通信失敗・有効なオフライン資格がありません", expired:"会員資格の有効期限が切れています", past_due:"支払い確認が必要です（無料機能は利用できます）", unpaid:"支払い未完了（無料機能は利用できます）", canceled:"契約が終了しました", invalid_qualification:"会員資格の署名を確認できません", clock_invalid:"端末の時刻を確認してください", browser_demo:"ブラウザの表示デモです" };

export function SupporterBenefitsPanel({ onAccount, locale: localeOverride }: { onAccount: () => void; locale?: AppLocale }) {
  const { locale: preferredLocale } = useI18n();
  const locale = localeOverride ?? preferredLocale;
  const copy = supporterText(locale);
  const { member, error, refresh, changed } = useMembership();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const paid = member?.plan === "supporter";
  const apply = async (task: () => ReturnType<typeof backend.membershipSetTheme>) => {
    setBusy(true); setNotice("");
    try { changed(await task()); setNotice("設定を保存しました"); }
    catch (error) { setNotice(String(error)); }
    finally { setBusy(false); }
  };
  return <section className="supporter-benefits">
    <span className="section-kicker">SUPPORT</span><h3>{copy.title}</h3><p>{copy.intro}</p>
    <div className="membership-summary" role="status"><strong>{paid ? "Supporter" : "Free Plan"}</strong><span>登録数：{member?.registeredCount ?? "確認中"} / {paid ? "無制限" : `${supportConfig.freeServerLimit}個`}</span>
      {member?.paidUntil ? <span>支払い済み期間：{new Date(member.paidUntil).toLocaleDateString(locale)}まで</span> : null}
      {member?.cancelAtPeriodEnd ? <span>期間末の解約予約済み・支払い済み期間まで特典を利用できます</span> : null}
      <small>{member ? membershipStates[member.state] ?? "会員資格を確認中" : "会員資格を確認中"}{error ? ` · ${error}` : ""}</small>
      <button type="button" disabled={busy} onClick={() => void refresh(true)}>会員状態を再確認</button>
    </div>
    <div className="plan-grid member-plan-grid"><article className="current"><h4>Free Plan</h4><strong>¥0 / 月</strong><ul>{copy.freeFeatures.map(item => <li key={item}>{item}</li>)}</ul></article>
      <article className="member-supporter-plan"><h4>Supporter</h4><strong>{copy.monthlyPrice.replace("{amount}", formatSupportMonthlyAmount(locale))}</strong><ul>{copy.candidateFeatures.map(item => <li key={item}>{item}</li>)}</ul><p>{supportConfig.enabled ? copy.availableTitle : copy.pendingTitle}</p><p>{copy.pendingBody}</p><button className="primary-button" type="button" disabled={!supportConfig.enabled || busy} onClick={onAccount}>{supportConfig.enabled ? copy.supportButton : "本番受付は準備中"}</button></article></div>
    <p>{copy.afterStoppingBody}</p><p>「無制限」は登録数です。PCの性能を超えた同時起動を保証しません。</p>
    <h4>新機能の先行体験</h4><label className="switch-row"><input type="checkbox" checked={member?.previewOptIn ?? false} disabled={!paid || busy} onChange={event => void apply(() => backend.membershipSetPreview(event.target.checked))} />提供準備が整った先行体験を任意で有効化</label>
    {previewFeatures.length === 0 ? <p>現在提供中の先行体験はありません。毎月の追加はお約束しません。</p> : previewFeatures.map(feature => <p key={feature.id}>{feature.title}・開発中：{feature.audience}／{feature.impact}</p>)}
    <h4>Supporter限定テーマ</h4><p>既存のダーク／ライト、アクセント色は引き続き無料です。見本はどなたでも確認できます。</p>
    <div className="member-theme-grid">{memberThemes.map(theme => <article key={theme.id} style={{ background: theme.background, borderColor: theme.accent, color: "#f3f4f8" }}>
      <div className="member-theme-swatch" style={{ background: theme.accent }} aria-hidden="true" /><strong>{theme.name}</strong><p>{theme.description}</p><button type="button" disabled={!paid || busy} onClick={() => void apply(() => backend.membershipSetTheme(theme.id))}>{member?.theme === theme.id ? "適用中" : paid ? "適用する" : "Supporter限定"}</button>
    </article>)}</div>
    <button type="button" disabled={busy || !member?.theme} onClick={() => void apply(() => backend.membershipSetTheme(null))}>標準テーマに戻す</button>
    <p>資格終了・ログアウト後は最後の標準テーマへ戻します。Windows標準タイトルバーは対象外です。</p>
    {notice ? <p role="status">{notice}</p> : null}
  </section>;
}
