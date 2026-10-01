import { useEffect, useRef, useState } from "react";
import { backend, confirmDanger } from "../lib/backend";
import { discordErrorText, discordText, type DiscordMessageKey } from "../lib/discordLocale";
import { useI18n } from "../lib/i18n";
import { useMembership, type DiscordEvents, type DiscordMentions, type DiscordView } from "../lib/membership";
import type { ServerProfile } from "../types";

const NEW_DESTINATION_MENTIONS: DiscordMentions = { enabled: true, mode: "everyone", roleId: "" };
const resultKeys: Record<string, DiscordMessageKey> = {
  not_sent: "statusNotSent",
  queued: "statusQueued",
  sent: "statusSent",
  timeout: "statusTimeout",
  network_failed: "statusNetworkFailed",
  delivery_failed: "statusDeliveryFailed",
  mention_configuration_invalid: "statusMentionInvalid",
  rate_limited: "statusRateLimited",
  cancelled: "statusCancelled",
  qualification_required: "statusQualification",
  expired: "statusExpired",
  queue_full: "statusQueueFull",
  locale_not_ready: "statusLocaleNotReady",
};

function sameMentions(left: DiscordMentions, right: DiscordMentions): boolean {
  return left.enabled === right.enabled && left.mode === right.mode && left.roleId === right.roleId;
}
function targetDescription(locale: ReturnType<typeof useI18n>["locale"], mentions: DiscordMentions): string {
  if (!mentions.enabled) return discordText(locale, "noMentions");
  if (mentions.mode === "here") return discordText(locale, "here");
  if (mentions.mode === "everyone") return discordText(locale, "everyone");
  return mentions.roleId.trim()
    ? `${discordText(locale, "role")} (${mentions.roleId.trim()})`
    : `${discordText(locale, "role")} (${discordText(locale, "roleIdMissing")})`;
}
function roleIdIsValid(mentions: DiscordMentions): boolean {
  return !mentions.enabled || mentions.mode !== "role" || /^[0-9]{17,22}$/.test(mentions.roleId.trim());
}

export function DiscordNotificationPanel({ servers }: { servers: ServerProfile[] }) {
  const { member } = useMembership();
  const { locale, discordLocaleSyncReady, discordLocaleSyncFailed, resyncDiscordLocale } = useI18n();
  const t = (key: DiscordMessageKey, values: Record<string, string> = {}) => discordText(locale, key, values);
  const [id, setId] = useState(servers[0]?.id ?? "");
  const [snapshot, setSnapshot] = useState<{ serverId: string; view: DiscordView } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DiscordMentions>>({});
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const paid = member?.plan === "supporter";
  const selectedId = useRef(id);
  selectedId.current = id;
  const busyRef = useRef(false);
  const requestGeneration = useRef(0);
  const activeAction = useRef(0);
  const mounted = useRef(true);
  const initializedMentions = useRef(new Set<string>());

  const view = snapshot?.serverId === id ? snapshot.view : null;
  const savedMentions = view?.mentions ?? NEW_DESTINATION_MENTIONS;
  const draftMentions = drafts[id] ?? savedMentions;
  const mentionsDirty = !!view?.registered && !sameMentions(draftMentions, savedMentions);
  const selectedServer = servers.find(server => server.id === id);
  const serverName = selectedServer?.name ?? t("serverLabel");
  const selectedTarget = targetDescription(locale, savedMentions);

  useEffect(() => {
    let active = true;
    if (!id) {
      setSnapshot(null);
      setUrl("");
      return () => { active = false; };
    }
    setUrl("");
    setSnapshot(current => current?.serverId === id ? current : null);
    const refresh = async () => {
      if (busyRef.current) return;
      const requestedId = id;
      const request = ++requestGeneration.current;
      try {
        const next = await backend.discordStatus(requestedId);
        if (!active || busyRef.current || request !== requestGeneration.current || selectedId.current !== requestedId) return;
        setSnapshot({ serverId: requestedId, view: next });
        if (!initializedMentions.current.has(requestedId)) {
          initializedMentions.current.add(requestedId);
          setDrafts(current => current[requestedId] ? current : { ...current, [requestedId]: next.mentions });
        }
      } catch {
        if (active && selectedId.current === requestedId && request === requestGeneration.current) setNotice(t("loadingFailed"));
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
      requestGeneration.current += 1;
    };
  }, [id, locale]);

  useEffect(() => {
    if (servers.length && !servers.some(server => server.id === id)) {
      const nextId = servers[0].id;
      selectedId.current = nextId;
      setId(nextId);
    }
  }, [servers, id]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestGeneration.current += 1; };
  }, []);

  const updateDraft = (next: DiscordMentions) => setDrafts(current => ({ ...current, [id]: next }));
  const runAction = async (serverId: string, task: () => Promise<DiscordView>, success: string, confirmation?: string) => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setNotice("");
    const request = ++requestGeneration.current;
    activeAction.current = request;
    try {
      if (confirmation && !await confirmDanger(confirmation)) return null;
      if (selectedId.current !== serverId || request !== requestGeneration.current) return null;
      const next = await task();
      if (mounted.current && request === requestGeneration.current && selectedId.current === serverId) {
        setSnapshot({ serverId, view: next });
        setDrafts(current => ({ ...current, [serverId]: next.mentions }));
        initializedMentions.current.add(serverId);
        setNotice(success);
      }
      return next;
    } catch (error) {
      if (mounted.current && request === requestGeneration.current && selectedId.current === serverId) setNotice(discordErrorText(locale, error));
      return null;
    } finally {
      if (activeAction.current === request) {
        activeAction.current = 0;
        busyRef.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  };

  const saveDestination = async () => {
    if (!id || !url.trim() || !paid || busyRef.current) return;
    const serverId = id;
    const replacing = !!view?.registered;
    const message = t(replacing ? "replaceDestinationConfirm" : "saveDestinationConfirm", { name: serverName, target: targetDescription(locale, draftMentions) });
    const secret = url.trim();
    setUrl("");
    await runAction(serverId, () => backend.discordSaveDestination(serverId, secret, draftMentions, true), t("saveDestinationSuccess"), message);
  };

  const saveMentions = async () => {
    if (!view?.registered || !mentionsDirty || busyRef.current) return;
    const serverId = id;
    const message = t("saveMentionsConfirm", { name: serverName, target: targetDescription(locale, draftMentions) });
    await runAction(serverId, () => backend.discordSetNotifications(serverId, false, view.events, draftMentions, true), t("saveMentionsSuccess"), message);
  };

  const deleteDestination = async () => {
    if (!view?.registered || busyRef.current) return;
    const serverId = id;
    const message = t("deleteConfirm", { name: serverName });
    await runAction(serverId, () => backend.discordDeleteDestination(serverId, true), t("deleteSuccess"), message);
  };

  const enableNotifications = async (enabled: boolean) => {
    if (!view?.registered || busyRef.current) return;
    const serverId = id;
    if (!enabled) {
      await runAction(serverId, () => backend.discordSetNotifications(serverId, false, view.events, savedMentions, false), t("stoppedSuccess"));
      return;
    }
    if (!discordLocaleSyncReady) {
      setNotice(discordLocaleSyncFailed ? t("localeSyncFailed") : t("statusLocaleNotReady"));
      return;
    }
    if (!paid) {
      setNotice(t("supporterError"));
      return;
    }
    if (mentionsDirty) {
      setNotice(t("unsavedError"));
      return;
    }
    if (!roleIdIsValid(savedMentions)) {
      setNotice(t("roleRequired"));
      return;
    }
    const selectedEvents = Object.entries(view.events).filter(([, active]) => active).map(([event]) => t(event as keyof DiscordEvents));
    const message = t("enableConfirm", { name: serverName, events: selectedEvents.join(", ") || "—", target: selectedTarget });
    await runAction(serverId, () => backend.discordSetNotifications(serverId, true, view.events, savedMentions, true), t("enabledSuccess"), message);
  };

  const toggleEvent = async (key: keyof DiscordEvents, enabled: boolean) => {
    if (!view?.registered || busyRef.current || mentionsDirty || !paid || !discordLocaleSyncReady) return;
    const serverId = id;
    const events = { ...view.events, [key]: enabled };
    const adding = enabled && !view.events[key];
    const confirmation = adding ? t("eventConfirm", {
      name: serverName,
      event: t(key),
      target: selectedTarget,
      state: view.enabled ? t("eventEnabledQueueWarning") : t("eventDisabledNotice"),
    }) : undefined;
    await runAction(serverId, () => backend.discordSetNotifications(serverId, view.enabled, events, savedMentions, !!confirmation), t("eventsSuccess"), confirmation);
  };

  const sendTest = async () => {
    if (!view?.registered || !view.enabled || !paid || mentionsDirty || !roleIdIsValid(savedMentions) || busyRef.current || !discordLocaleSyncReady) return;
    const serverId = id;
    const message = t("testConfirm", { name: serverName, target: selectedTarget });
    await runAction(serverId, () => backend.discordTestNotification(serverId, true), t("testQueuedSuccess"), message);
  };

  const switchDisabled = !view?.registered || busy || !discordLocaleSyncReady || (!view.enabled && (!paid || mentionsDirty));
  const lastResult = resultKeys[view?.lastResult ?? "not_sent"] ?? "statusNotSent";

  return <section className="discord-notification-panel">
    <h3>{t("title")}</h3>
    <p>{t("intro")}</p>
    <p>{t("timestampHelp")}</p>
    {!paid ? <p className="info-callout">{t("supporterRequired")}</p> : null}
    {discordLocaleSyncFailed ? <p className="info-callout" role="alert">{t("localeSyncFailed")} <button type="button" onClick={() => void resyncDiscordLocale().catch(() => undefined)}>{t("retryLocaleSync")}</button></p> : null}
    <label>{t("serverLabel")}<select value={id} disabled={busy} onChange={event => { const nextId = event.target.value; selectedId.current = nextId; setId(nextId); }}>{servers.map(server => <option key={server.id} value={server.id}>{server.name}</option>)}</select></label>
    {id ? <>
      <p>{t("destinationLabel")}: {view?.registered ? t("registered") : t("notRegistered")}</p>
      <label>{t("urlLabel")}<input type="password" autoComplete="new-password" value={url} disabled={!paid || busy} onChange={event => setUrl(event.target.value)} placeholder="https://discord.com/api/webhooks/…" /></label>
      <button type="button" disabled={!paid || busy || !view || !url.trim()} onClick={() => void saveDestination()}>{t("saveDestination")}</button>
      <button type="button" disabled={!view?.registered || busy} onClick={() => void deleteDestination()}>{t("deleteDestination")}</button>
      <p>{t("saveOnlyHelp")}</p>

      {view?.registered ? <fieldset className="discord-mentions" disabled={busy}>
        <legend>{t("mentionSettings")}</legend>
        <label className="switch-row"><input type="checkbox" checked={draftMentions.enabled} onChange={event => updateDraft({ ...draftMentions, enabled: event.target.checked })} />{t("mentionEnabled")}</label>
        <label className="discord-mention-target-row"><span className="discord-mentions-label">{t("mentionTarget")}</span><select value={draftMentions.mode} disabled={!draftMentions.enabled} onChange={event => updateDraft({ ...draftMentions, mode: event.target.value as DiscordMentions["mode"] })}>
          <option value="role">{t("role")}</option><option value="here">{t("here")}</option><option value="everyone">{t("everyone")}</option>
        </select></label>
        {draftMentions.enabled && draftMentions.mode === "role" ? <label>{t("roleId")}<input inputMode="numeric" autoComplete="off" value={draftMentions.roleId} onChange={event => updateDraft({ ...draftMentions, roleId: event.target.value.replace(/\D/g, "").slice(0, 22) })} placeholder={t("roleIdPlaceholder")} /></label> : null}
        <p>{t("mentionSummary", { target: targetDescription(locale, draftMentions) })}</p>
        <button type="button" disabled={busy || !mentionsDirty} onClick={() => void saveMentions()}>{t("saveMentions")}</button>
        {mentionsDirty ? <p role="status">{t("unsavedMentions")}</p> : null}
      </fieldset> : <p>{t("initialMentions")}</p>}

      <label className="switch-row"><input type="checkbox" checked={view?.enabled ?? false} disabled={switchDisabled} onChange={event => void enableNotifications(event.target.checked)} />{t("enableNotifications")}</label>
      <fieldset disabled={!paid || busy || !view?.registered || mentionsDirty || !discordLocaleSyncReady}><legend>{t("events")}</legend>{(["started", "stopped", "crashed"] as const).map(event => <label key={event}><input type="checkbox" checked={view?.events[event] ?? false} onChange={e => void toggleEvent(event, e.target.checked)} />{t(event)}</label>)}</fieldset>
      <button type="button" disabled={!paid || busy || !view?.enabled || mentionsDirty || !roleIdIsValid(savedMentions) || !discordLocaleSyncReady} onClick={() => void sendTest()}>{t("test")}</button>
      <p role="status">{t(lastResult)}</p>
    </> : <p>{t("noServers")}</p>}
    <p>{t("footer")}</p>
    {notice ? <p role="status">{notice}</p> : null}
  </section>;
}
