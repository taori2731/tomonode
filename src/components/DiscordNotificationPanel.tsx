import { useEffect, useState } from "react";
import { backend, confirmDanger } from "../lib/backend";
import { useMembership, type DiscordEvents, type DiscordView } from "../lib/membership";
import type { ServerProfile } from "../types";

const results: Record<string, string> = { not_sent: "まだ送信していません", queued: "送信待ち", sent: "送信成功", network_failed: "通信失敗（重複防止のため自動再送しません）", delivery_failed: "送信失敗", rate_limited: "Discordのレート制限", cancelled: "設定変更により送信を取り消しました", qualification_required: "会員資格を確認できないため停止", expired: "送信待ちの期限切れ", queue_full: "通知が多いため送信を省略しました" };
export function DiscordNotificationPanel({ servers }: { servers: ServerProfile[] }) {
  const { member } = useMembership();
  const [id, setId] = useState(servers[0]?.id ?? "");
  const [view, setView] = useState<DiscordView | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const paid = member?.plan === "supporter";
  useEffect(() => {
    let active = true; setUrl(""); setView(null);
    const refresh = () => { if (id) void backend.discordStatus(id).then(v => { if (active) setView(v); }).catch(() => { if (active) setNotice("通知設定を読み込めませんでした"); }); };
    refresh(); const timer = window.setInterval(refresh, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [id]);
  const action = async (task: () => Promise<DiscordView>) => {
    setBusy(true); setNotice("");
    try { setView(await task()); setNotice("通知設定を更新しました"); }
    catch (error) { setNotice(String(error)); }
    finally { setBusy(false); setUrl(""); }
  };
  const toggleEvent = (key: keyof DiscordEvents, enabled: boolean) => { if (view) void action(() => backend.discordSetNotifications(id, view.enabled, { ...view.events, [key]: enabled })); };
  return <section className="discord-notification-panel"><h3>Discord運営通知</h3><p>自分で指定したチャンネルへ、サーバー名・イベント・時刻だけを送信します。IP、参加者、チャット、ログ、ローカルパスは送りません。</p>
    {!paid ? <p className="info-callout">Supporter資格が必要です。本番受付は準備中です。</p> : null}
    <label>対象サーバー<select value={id} disabled={busy} onChange={event => setId(event.target.value)}>{servers.map(server => <option key={server.id} value={server.id}>{server.name}</option>)}</select></label>
    {id ? <><p>通知先：{view?.registered ? "登録済み（秘密URLは表示しません）" : "未設定"}</p>
      <label>新しいWebhook URL<input type="password" autoComplete="off" value={url} disabled={!paid || busy} onChange={event => setUrl(event.target.value)} placeholder="https://discord.com/api/webhooks/…" /></label>
      <button type="button" disabled={!paid || busy || !url.trim()} onClick={() => void action(() => backend.discordSaveDestination(id, url))}>通知先を保存・置き換え</button>
      <button type="button" disabled={!view?.registered || busy} onClick={() => void action(() => backend.discordDeleteDestination(id))}>通知先を削除</button>
      <p>保存だけでは送信しません。Discordの「チャンネル設定 → 連携サービス → ウェブフック」で作成できます。投稿権限を持つ秘密情報なので共有しないでください。</p>
      <label className="switch-row"><input type="checkbox" checked={view?.enabled ?? false} disabled={!view?.registered || busy || (!paid && !view?.enabled)} onChange={event => { if (view) void action(() => backend.discordSetNotifications(id, event.target.checked, view.events)); }} />このサーバーの通知を有効化</label>
      <fieldset disabled={!paid || busy || !view?.registered}><legend>通知するイベント</legend>{([ ["started", "起動完了"], ["stopped", "停止完了"], ["crashed", "異常終了"] ] as const).map(([event, label]) => <label key={event}><input type="checkbox" checked={view?.events[event] ?? false} onChange={e => toggleEvent(event, e.target.checked)} />{label}</label>)}</fieldset>
      <button type="button" disabled={!paid || busy || !view?.enabled} onClick={() => void (async () => {
        if (await confirmDanger(`「${servers.find(server => server.id === id)?.name ?? "サーバー"}」の登録済みDiscordチャンネルへテスト通知を送信します。\n内容：サーバー名、テスト通知、発生時刻。サーバー操作は行いません。送信しますか？`)) await action(() => backend.discordTestNotification(id, true));
      })()}>テスト通知を送信</button><p role="status">{results[view?.lastResult ?? "not_sent"] ?? "送信状況を確認中"}</p></> : <p>先にサーバーを登録してください。</p>}
    <p>TomoNodeとPCが動作中の通知です。PCの電源断・通信断そのものは通知できません。契約終了・ログアウト後は停止し、再加入後は自分で再有効化してください。</p>
    {notice ? <p role="status">{notice}</p> : null}
  </section>;
}
