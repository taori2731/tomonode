import { lazy, startTransition, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./components/Icon";
import { OverviewTab } from "./components/OverviewTab";
import { OperationOverlay } from "./components/OperationOverlay";
import { monitoringWarnings, readMonitoring } from "./lib/monitoring";
import { ServerHeader } from "./components/ServerHeader";
import { HomeHub } from "./components/HomeHub";
import { DiscoverPage, GlobalSearch, NewsPage, ServerDirectoryPage, TemplatesPage } from "./components/HubPages";
import { Sidebar } from "./components/Sidebar";
import { backend, confirmDanger, selectLogDestination } from "./lib/backend";
import { ExternalLinkHandler } from "./components/ExternalLinkHandler";
import { I18nProvider, useI18n } from "./lib/i18n";
import { customAccentStyle, readAppearance } from "./lib/appearance";
import { readServerIcons, storeServerIcons, withServerIcon, type ServerIconMap } from "./lib/serverIcons";
import { getDefaultPortForServerType, getServerMaxPlayers, getServerTabs, isPalworldServer } from "./lib/gameAdapter";
import { dismissMigrationNotice, readAppUpdatePreferences, shouldShowMigrationNotice } from "./lib/appUpdate";
import { appUpdateText } from "./lib/appUpdateLocale";
import { workspaceText } from "./lib/workspaceLocale";
import { homeText } from "./lib/homeLocale";
import { brand, formatNotificationTitle } from "./lib/brand";
import { rebrandText } from "./lib/rebrandLocale";
import { accountText } from "./lib/accountLocale";
import { BACKGROUND_STATUS_POLL_INTERVAL_MS, isServerWorkspaceVisible, selectedLogPollInterval, selectedStatusPollInterval, shouldPollBackgroundStatuses } from "./lib/pollingPolicy";
import { sameLogSnapshot } from "./lib/logs";
import { sameRuntimeStatus } from "./lib/runtimeStatus";
import { MigrationNoticeDialog } from "./components/MigrationNoticeDialog";
import type { AppSection, AppearanceSettings, DeleteServerResult, LogEntry, MonitoringSettings, RuntimeStatus, ServerProfile, TabId, ThemeMode } from "./types";

const ConsoleTab = lazy(() => import("./components/ConsoleTab").then((module) => ({ default: module.ConsoleTab })));
const AppSettingsDialog = lazy(() => import("./components/AppSettingsDialog").then((module) => ({ default: module.AppSettingsDialog })));
const AccountDialog = lazy(() => import("./components/AccountDialog").then((module) => ({ default: module.AccountDialog })));
const CreateServerWizard = lazy(() => import("./components/CreateServerWizard").then((module) => ({ default: module.CreateServerWizard })));
const DeleteServerDialog = lazy(() => import("./components/DeleteServerDialog").then((module) => ({ default: module.DeleteServerDialog })));
const ExtensionsTab = lazy(() => import("./components/ExtensionsTab").then((module) => ({ default: module.ExtensionsTab })));
const PlayerAccessTab = lazy(() => import("./components/FilesPlayersTab").then((module) => ({ default: module.PlayerAccessTab })));
const ServerFilesTab = lazy(() => import("./components/FilesPlayersTab").then((module) => ({ default: module.ServerFilesTab })));
const InviteDialog = lazy(() => import("./components/InviteDialog").then((module) => ({ default: module.InviteDialog })));
const PalworldInviteDialog = lazy(() => import("./components/PalworldInviteDialog").then((module) => ({ default: module.PalworldInviteDialog })));
const CrossplayInviteDialog = lazy(() => import("./components/CrossplayInviteDialog").then((module) => ({ default: module.CrossplayInviteDialog })));
const ImportServerWizard = lazy(() => import("./components/ImportServerWizard").then((module) => ({ default: module.ImportServerWizard })));
const SettingsTab = lazy(() => import("./components/SettingsTab").then((module) => ({ default: module.SettingsTab })));
const ServerLabTab = lazy(() => import("./components/ServerLabTab").then((module) => ({ default: module.ServerLabTab })));
const SafetyToolsTab = lazy(() => import("./components/SafetyToolsTab").then((module) => ({ default: module.SafetyToolsTab })));
const OperationsCenterTab = lazy(() => import("./components/OperationsCenterTab").then((module) => ({ default: module.OperationsCenterTab })));
const PalworldOverviewTab = lazy(() => import("./components/PalworldOverviewTab").then((module) => ({ default: module.PalworldOverviewTab })));
const PalworldPlayersTab = lazy(() => import("./components/PalworldPlayersTab").then((module) => ({ default: module.PalworldPlayersTab })));
const PalworldSettingsTab = lazy(() => import("./components/PalworldSettingsTab").then((module) => ({ default: module.PalworldSettingsTab })));
const PalworldConsoleTab = lazy(() => import("./components/PalworldConsoleTab").then((module) => ({ default: module.PalworldConsoleTab })));
const PalworldBusyOverlay = lazy(() => import("./components/PalworldBusyOverlay").then((module) => ({ default: module.PalworldBusyOverlay })));

function preloadTabModule(tab: TabId, palworld: boolean) {
  if (tab === "console") return palworld ? import("./components/PalworldConsoleTab") : import("./components/ConsoleTab");
  if (tab === "overview" && palworld) return import("./components/PalworldOverviewTab");
  if (tab === "players") return palworld ? import("./components/PalworldPlayersTab") : import("./components/FilesPlayersTab");
  if (tab === "files") return import("./components/FilesPlayersTab");
  if (tab === "extensions") return import("./components/ExtensionsTab");
  if (tab === "operations") return import("./components/OperationsCenterTab");
  if (tab === "lab") return import("./components/ServerLabTab");
  if (tab === "safety") return import("./components/SafetyToolsTab");
  if (tab === "settings") return palworld ? import("./components/PalworldSettingsTab") : import("./components/SettingsTab");
  return Promise.resolve();
}

const stoppedStatus = (server?: ServerProfile): RuntimeStatus => ({
  state: "stopped",
  playerCount: 0,
  maxPlayers: server ? getServerMaxPlayers(server) : 20,
  onlinePlayers: [],
  memoryUsedMib: 0,
  uptimeSeconds: 0,
  address: `localhost:${server?.port ?? getDefaultPortForServerType(server?.serverType ?? "paper")}`,
  cpuPercent: 0,
  tps: null,
  tpsSupported: server?.serverType === "paper" || server?.serverType === "vanilla",
  pingLatencyMs: null,
});

export function createRefreshGuard(refresh: () => Promise<void>) {
  let inFlight = false;
  return async () => {
    if (inFlight) return;
    inFlight = true;
    try { await refresh(); } finally { inFlight = false; }
  };
}

function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("server-hub:theme:v1");
    return saved === "dark" || saved === "light" || saved === "system" ? saved : "dark";
  });
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  const [appearance, setAppearance] = useState<AppearanceSettings>(readAppearance);

  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => localStorage.setItem("server-hub:theme:v1", mode), [mode]);
  const resolved = mode === "system" ? (systemDark ? "dark" : "light") : mode;
  return { mode, resolved, appearance, setAppearance, cycle: () => setMode((current) => current === "system" ? "dark" : current === "dark" ? "light" : "system") };
}

export function AppContent() {
  const theme = useTheme();
  const { locale, t } = useI18n();
  const workspaceCopy = useMemo(() => workspaceText(locale), [locale]);
  const homeCopy = useMemo(() => homeText(locale), [locale]);
  const accountCopy = useMemo(() => accountText(locale), [locale]);
  const tabs = useMemo<{ id: TabId; label: string; icon: Parameters<typeof Icon>[0]["name"] }[]>(() => [
    { id: "overview", label: t("overview"), icon: "chart" },
    { id: "console", label: t("console"), icon: "console" },
    { id: "players", label: t("players"), icon: "users" },
    { id: "files", label: t("files"), icon: "folder" },
    { id: "extensions", label: t("extensions"), icon: "plugin" },
    { id: "operations", label: "自動運用", icon: "clock" },
    { id: "lab", label: t("lab"), icon: "memory" },
    { id: "safety", label: t("safety"), icon: "check" },
    { id: "settings", label: t("settings"), icon: "gear" },
  ], [t]);
  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [statuses, setStatuses] = useState<Record<string, RuntimeStatus>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [activeSection, setActiveSection] = useState<AppSection>("home");
  const workspaceRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (workspaceRef.current) workspaceRef.current.scrollTop = 0;
  }, [activeTab, selectedId]);
  const [showWizard, setShowWizard] = useState(false);
  const [initialTemplateId, setInitialTemplateId] = useState<string>();
  const [showImport, setShowImport] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showCrossplayInvite, setShowCrossplayInvite] = useState(false);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ServerProfile>();
  const [busyAction, setBusyAction] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showMigrationNotice, setShowMigrationNotice] = useState(() => shouldShowMigrationNotice(backend.isDesktop));
  const [monitoring, setMonitoring] = useState<MonitoringSettings>(readMonitoring);
  const [serverIcons, setServerIcons] = useState<ServerIconMap>(readServerIcons);
  const deliveredWarnings = useRef(new Set<string>());
  const closePromptOpen = useRef(false);
  const startupUpdateChecked = useRef(false);

  useEffect(() => {
    document.title = brand.productName;
  }, []);

  const selected = useMemo(() => servers.find((server) => server.id === selectedId), [servers, selectedId]);
  const selectedStatus = selected ? statuses[selected.id] ?? stoppedStatus(selected) : stoppedStatus();
  const selectedIsPalworld = Boolean(selected && isPalworldServer(selected));
  const visibleTabs = useMemo(() => selected ? tabs.filter((tab) => getServerTabs(selected).includes(tab.id)) : tabs, [selected, tabs]);
  const availableTabs = useMemo(() => visibleTabs.map((tab) => tab.id), [visibleTabs]);
  const updateServer = useCallback((updated: ServerProfile) => setServers((current) => current.map((item) => item.id === updated.id ? updated : item)), []);
  const updateServerIcon = useCallback((serverId: string, dataUrl?: string) => {
    const next = withServerIcon(serverIcons, serverId, dataUrl);
    storeServerIcons(next);
    setServerIcons(next);
  }, [serverIcons]);

  useEffect(() => {
    if (selected && !visibleTabs.some((tab) => tab.id === activeTab)) setActiveTab("overview");
  }, [activeTab, selected, visibleTabs]);

  const refreshServers = useCallback(async () => {
    const items = await backend.listServers();
    setServers(items);
    setSelectedId((current) => current && items.some((server) => server.id === current) ? current : items[0]?.id);
  }, []);

  useEffect(() => {
    refreshServers().catch((reason: unknown) => setError(String(reason))).finally(() => setLoading(false));
  }, [refreshServers]);

  useEffect(() => {
    if (startupUpdateChecked.current) return;
    startupUpdateChecked.current = true;
    const preferences = readAppUpdatePreferences();
    if (!preferences.autoCheck || !backend.isDesktop) return;
    backend.checkAppUpdate(preferences.endpoint)
      .then((info) => {
        if (info.available && info.version) setToast(appUpdateText(locale, "startupAvailable", { version: info.version }));
      })
      .catch(() => undefined);
  }, [locale]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    const refresh = createRefreshGuard(async () => {
      if (!active || document.hidden) return;
      const next = await backend.status(selectedId);
      if (active) startTransition(() => setStatuses((current) => sameRuntimeStatus(current[selectedId], next) ? current : { ...current, [selectedId]: next }));
    });
    refresh().catch(() => undefined);
    const interval = selectedStatusPollInterval(selectedStatus.state, activeSection);
    const timer = window.setInterval(() => refresh().catch(() => undefined), interval);
    const onVisibilityChange = () => { if (!document.hidden) refresh().catch(() => undefined); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [activeSection, selectedId, selectedStatus.state]);

  useEffect(() => {
    const background = servers.filter((server) => server.id !== selectedId);
    if (!shouldPollBackgroundStatuses(activeSection, background.length)) return;
    let active = true;
    const refresh = createRefreshGuard(async () => {
      if (!active || document.hidden) return;
      const results = await Promise.all(background.map(async (server) => [server.id, await backend.status(server.id)] as const));
      if (!active) return;
      startTransition(() => setStatuses((current) => {
        if (results.every(([id, status]) => sameRuntimeStatus(current[id], status))) return current;
        return { ...current, ...Object.fromEntries(results) };
      }));
    });
    refresh().catch(() => undefined);
    const timer = window.setInterval(() => refresh().catch(() => undefined), BACKGROUND_STATUS_POLL_INTERVAL_MS);
    const onVisibilityChange = () => { if (!document.hidden) refresh().catch(() => undefined); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [activeSection, servers, selectedId]);

  useEffect(() => {
    if (!selectedId) { setLogs([]); return; }
    const interval = selectedLogPollInterval(selectedStatus.state, activeSection, activeTab);
    if (!isServerWorkspaceVisible(activeSection)) return;
    let active = true;
    const refresh = createRefreshGuard(async () => {
      if (!active || document.hidden) return;
      const entries = await backend.logs(selectedId);
      if (active) startTransition(() => setLogs((current) => sameLogSnapshot(current, entries) ? current : entries));
    });
    refresh().catch(() => undefined);
    const timer = interval ? window.setInterval(refresh, interval) : undefined;
    const onVisibilityChange = () => { if (!document.hidden) refresh().catch(() => undefined); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [activeSection, selectedId, selectedStatus.state, activeTab]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2_600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const update = () => setMonitoring(readMonitoring());
    window.addEventListener("server-hub:monitoring-settings-changed", update);
    return () => window.removeEventListener("server-hub:monitoring-settings-changed", update);
  }, []);

  useEffect(() => {
    const currentWarnings = new Set(monitoringWarnings(servers, statuses, monitoring));
    const newWarning = [...currentWarnings].find((warning) => !deliveredWarnings.current.has(warning));
    deliveredWarnings.current = currentWarnings;
    if (newWarning) setToast(`監視通知: ${newWarning}`);
  }, [monitoring, servers, statuses]);

  useEffect(() => {
    if (!backend.isDesktop) return;
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => listen<{ title: string; body: string }>("local-notification", async ({ payload }) => {
      try {
        const notifications = await import("@tauri-apps/plugin-notification");
        let allowed = await notifications.isPermissionGranted();
        if (!allowed) allowed = (await notifications.requestPermission()) === "granted";
        if (allowed) notifications.sendNotification({ title: formatNotificationTitle(payload.title), body: payload.body });
      } catch { /* The in-app status remains available when Windows notifications are disabled. */ }
    })).then((dispose) => { unlisten = dispose; }).catch(() => undefined);
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!backend.isDesktop) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => listen("app-close-requested", async () => {
      if (!active || closePromptOpen.current) return;
      closePromptOpen.current = true;
      try {
        const confirmed = await confirmDanger(rebrandText(locale, "exitConfirm"));
        if (confirmed) await backend.quitApp();
      } catch (reason) {
        if (active) setError(String(reason));
      } finally {
        closePromptOpen.current = false;
      }
    })).then((dispose) => { unlisten = dispose; }).catch(() => undefined);
    return () => { active = false; unlisten?.(); };
  }, []);

  const runAction = async (name: "start" | "stop" | "restart") => {
    if (!selected) return;
    const serverId = selected.id;
    const transitionalState = name === "start" ? "starting" : name === "stop" ? "stopping" : "restarting";
    setBusyAction(name);
    setError("");
    setStatuses((current) => ({ ...current, [serverId]: { ...(current[serverId] ?? stoppedStatus(selected)), state: transitionalState } }));
    try {
      if (name === "start") await backend.start(serverId);
      if (name === "stop") await backend.stop(serverId);
      if (name === "restart") await backend.restart(serverId);
      const nextStatus = await backend.status(serverId);
      setStatuses((current) => ({ ...current, [serverId]: nextStatus }));
      setToast(name === "start" ? "サーバーを起動しました" : name === "stop" ? "サーバーを安全に停止しました" : "サーバーを再起動しました");
    } catch (reason) {
      const message = String(reason);
      if (message.includes("強制終了") && await confirmDanger(`${message}\n\nワールド破損の可能性があります。強制終了しますか？`)) {
        await backend.stop(serverId, true);
        const nextStatus = await backend.status(serverId);
        setStatuses((current) => ({ ...current, [serverId]: nextStatus }));
        setToast("サーバーを強制終了しました");
      } else {
        setError(message);
        try {
          const nextStatus = await backend.status(serverId);
          setStatuses((current) => ({ ...current, [serverId]: nextStatus }));
        } catch {
          setStatuses((current) => ({ ...current, [serverId]: { ...(current[serverId] ?? stoppedStatus(selected)), state: "unknown" } }));
        }
      }
    } finally {
      setBusyAction("");
    }
  };

  const copy = async (value: string, message = "コピーしました") => {
    await navigator.clipboard.writeText(value);
    setToast(message);
  };

  const sendCommand = async (command: string) => {
    if (!selected) return;
    const dangerous = /^(stop|op\s|deop\s|ban\s|pardon\s|whitelist\s+off|save-off|reload)/i.test(command);
    if (dangerous && !await confirmDanger(`「${command}」を実行しますか？\nこのコマンドはサーバー状態や権限を変更します。`)) return;
    await backend.sendCommand(selected.id, command);
    setToast("コマンドを送信しました");
  };

  const saveLogs = async () => {
    if (!selected) return;
    const destination = await selectLogDestination(`${selected.name}-${new Date().toISOString().slice(0, 10)}.log`);
    if (!destination) return;
    await backend.saveLogs(selected.id, destination);
    setToast("ログを保存しました");
  };

  const openServer = useCallback((serverId: string, tab: TabId = "overview") => {
    startTransition(() => {
      setSelectedId(serverId);
      setActiveTab(tab);
      setActiveSection(tab === "players" ? "players" : "home");
    });
  }, []);

  const navigateSection = useCallback((section: AppSection) => {
    startTransition(() => {
      setActiveSection(section);
      if (section === "players") setActiveTab("players");
      else if (section === "home") setActiveTab("overview");
    });
  }, []);

  const navigateTab = useCallback((tab: TabId) => {
    startTransition(() => {
      setActiveTab(tab);
      setActiveSection(tab === "players" ? "players" : "home");
    });
  }, []);

  const createFromTemplate = useCallback((templateId: string) => {
    setInitialTemplateId(templateId);
    setShowWizard(true);
  }, []);
  const openCreate = useCallback(() => { setInitialTemplateId(undefined); setShowWizard(true); }, []);
  const openImport = useCallback(() => setShowImport(true), []);
  const openAppSettings = useCallback(() => setShowAppSettings(true), []);
  const openExtensions = useCallback(() => selected ? openServer(selected.id, "extensions") : setToast(t("selectServerFirst")), [openServer, selected, t]);

  const serverNavigation = (
    <nav className="tabs" aria-label={t("serverDetails")}>
      {visibleTabs.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "active" : ""} onMouseEnter={() => void preloadTabModule(tab.id, selectedIsPalworld)} onFocus={() => void preloadTabModule(tab.id, selectedIsPalworld)} onClick={() => navigateTab(tab.id)}><Icon name={tab.icon} />{tab.label}</button>)}
    </nav>
  );

  return (
    <div className="app" data-product-name={brand.productName} data-theme={theme.resolved} data-accent={theme.appearance.accent} data-icon-scale={theme.appearance.iconScale} style={customAccentStyle(theme.appearance)}>
      <ExternalLinkHandler onError={setError} />
      <header className="titlebar" aria-label={brand.productName}>
        <img className="brand-mark" src={theme.resolved === "dark" ? "/assets/tomonode-icon-bg-black.png" : "/assets/tomonode-icon-bg-white.png"} alt="" aria-hidden="true" />
        <strong>{brand.productName}</strong>
        <span className="unofficial-label">{t("unofficial")}</span>
        <GlobalSearch servers={servers} onOpenServer={openServer} onSection={navigateSection} onSettings={openAppSettings} />
        <div className="titlebar-actions">
          <button className="top-button ghost account-button" type="button" onClick={() => setShowAccount(true)}><Icon name="users" size={18} />{accountCopy.account}</button>
          {selected?.serverType === "paper" ? <button className="top-button ghost crossplay-invite-button" type="button" onClick={() => setShowCrossplayInvite(true)}><Icon name="users" />{t("inviteBedrock")}</button> : null}
          <button className="top-button ghost" type="button" onClick={() => selected ? setShowInvite(true) : setToast(t("selectServerFirst"))}><Icon name="invite" />{t("inviteFriends")}</button>
          <button className="icon-button theme-button" type="button" onClick={theme.cycle} aria-label={`${t("theme")}: ${theme.mode}`} title={`${t("theme")}: ${theme.mode}`}><Icon name={theme.resolved === "dark" ? "moon" : "sun"} /></button>
          <button className="top-button ghost import-button" type="button" onClick={openImport}><Icon name="download" />{t("importServer")}</button>
          <button className="top-button create" type="button" onClick={openCreate}><Icon name="add" />{t("newServer")}</button>
        </div>
      </header>

      <div className="app-body">
        <Sidebar servers={servers} serverIcons={serverIcons} selectedId={selectedId} statuses={statuses} activeSection={activeSection} availableTabs={availableTabs} onSectionNavigate={navigateSection} onSelect={openServer} onCreate={openCreate} onImport={openImport} onDelete={setDeleteTarget} onAppSettings={openAppSettings} />
        <nav className="mobile-navigation" aria-label={workspaceCopy.servers}>
          <label><Icon name="server" size={17}/><select aria-label={t("serverList")} value={selectedId ?? ""} onChange={(event) => event.target.value && openServer(event.target.value)}><option value="" disabled>{t("serverList")}</option>{servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}</select></label>
          <div>
            <button type="button" className={activeSection === "home" ? "active" : ""} disabled={!selectedId} onClick={() => navigateSection("home")}><Icon name="chart"/>{homeCopy.home}</button>
            <button type="button" className={activeSection === "servers" ? "active" : ""} onClick={() => navigateSection("servers")}><Icon name="server"/>{workspaceCopy.servers}</button>
            <button type="button" className={activeSection === "players" ? "active" : ""} disabled={!selectedId || !selected || !getServerTabs(selected).includes("players")} onClick={() => navigateSection("players")}><Icon name="users"/>{workspaceCopy.players}</button>
            <button type="button" className={activeSection === "templates" ? "active" : ""} onClick={() => navigateSection("templates")}><Icon name="clipboard"/>{workspaceCopy.templates}</button>
            <button type="button" className={activeSection === "discover" ? "active" : ""} onClick={() => navigateSection("discover")}><Icon name="search"/>{workspaceCopy.discover}</button>
            <button type="button" className={activeSection === "news" ? "active" : ""} onClick={() => navigateSection("news")}><Icon name="info"/>{workspaceCopy.news}</button>
          </div>
        </nav>
        <main ref={workspaceRef} className="workspace" data-active-tab={activeTab}>
          {loading ? <div className="center-state" role="status" aria-label={`${brand.productName}: ${t("loadingServers")}`}><span className="spinner" /><strong>{t("loadingServers")}</strong></div> : null}
          {!loading && !selected && activeSection === "home" ? <div className="center-state empty" role="region" aria-label={`${brand.productName}: ${t("firstServerTitle")}`}><img src="/assets/voxel-server-island.png" alt="" /><h1>{t("firstServerTitle")}</h1><p>{t("firstServerBody")}</p><button className="primary-button" type="button" onClick={() => { setInitialTemplateId(undefined); setShowWizard(true); }}><Icon name="add" />{t("newServer")}</button></div> : null}
          {!loading && activeSection === "servers" ? <ServerDirectoryPage servers={servers} statuses={statuses} serverIcons={serverIcons} onOpen={openServer} onCreate={openCreate} /> : null}
          {!loading && activeSection === "templates" ? <TemplatesPage onUse={createFromTemplate} /> : null}
          {!loading && activeSection === "discover" ? <DiscoverPage onCreate={openCreate} onExtensions={openExtensions} /> : null}
          {!loading && activeSection === "news" ? <NewsPage /> : null}
          {selected && (activeSection === "home" || activeSection === "players") ? (
            activeTab === "overview" ? (
              <HomeHub
                servers={servers}
                selected={selected}
                statuses={statuses}
                serverIcons={serverIcons}
                onSelect={openServer}
                onCreate={openCreate}
                onNavigate={navigateTab}
                onCopyAddress={() => copy(selectedStatus.address)}
                below={
                  <div className="home-overview-below">
                    {serverNavigation}
                    <Suspense fallback={<div className="center-state tab-loading" role="status" aria-label={`${brand.productName}: ${t("loadingServers")}`}><span className="spinner" /><strong>{t("loadingServers")}</strong></div>}>
                      {selectedIsPalworld
                        ? <PalworldOverviewTab server={selected} status={selectedStatus} onCopyAddress={() => copy(selectedStatus.address)} notify={setToast} fail={setError} />
                        : <OverviewTab server={selected} status={selectedStatus} logs={logs} onCopyAddress={() => copy(selectedStatus.address, "サーバーアドレスをコピーしました")} onOpenFolder={() => backend.openFolder(selected.id)} onUpdated={updateServer} notify={setToast} fail={setError} onNavigate={navigateTab} onInvite={() => setShowInvite(true)} />}
                    </Suspense>
                  </div>
                }
              >
                <ServerHeader server={selected} serverIcon={serverIcons[selected.id]} status={selectedStatus} busyAction={busyAction} onStart={() => runAction("start")} onStop={() => runAction("stop")} onRestart={() => runAction("restart")} />
              </HomeHub>
            ) : (
              <>
                <ServerHeader server={selected} serverIcon={serverIcons[selected.id]} status={selectedStatus} busyAction={busyAction} compact onStart={() => runAction("start")} onStop={() => runAction("stop")} onRestart={() => runAction("restart")} />
                {serverNavigation}
                <Suspense fallback={<div className="center-state tab-loading" role="status" aria-label={`${brand.productName}: ${t("loadingServers")}`}><span className="spinner" /><strong>{t("loadingServers")}</strong></div>}>
                  {activeTab === "console" ? selectedIsPalworld
                    ? <PalworldConsoleTab logs={logs} running={selectedStatus.state === "running"} onClear={() => { backend.clearLogs(selected.id); setLogs([]); }} onCopy={(value) => copy(value)} onSave={saveLogs} />
                    : <ConsoleTab logs={logs} running={selectedStatus.state === "running"} onClear={() => { backend.clearLogs(selected.id); setLogs([]); }} onCopy={(value) => copy(value)} onSave={saveLogs} onCommand={sendCommand} /> : null}
                  {activeTab === "players" ? selectedIsPalworld ? <PalworldPlayersTab server={selected} status={selectedStatus} /> : <PlayerAccessTab server={selected} status={selectedStatus} notify={setToast} fail={setError} /> : null}
                  {activeTab === "files" ? <ServerFilesTab server={selected} status={selectedStatus} /> : null}
                  {!selectedIsPalworld && activeTab === "extensions" ? <ExtensionsTab server={selected} status={selectedStatus} notify={setToast} fail={setError} /> : null}
                  {activeTab === "operations" ? <OperationsCenterTab key={selected.id} server={selected} status={selectedStatus} onUpdated={updateServer} notify={setToast} fail={setError} /> : null}
                  {!selectedIsPalworld && activeTab === "lab" ? <ServerLabTab server={selected} status={selectedStatus} onUpdated={updateServer} notify={setToast} fail={setError} /> : null}
                  {!selectedIsPalworld && activeTab === "safety" ? <SafetyToolsTab server={selected} status={selectedStatus} onUpdated={updateServer} notify={setToast} fail={setError} /> : null}
                  {activeTab === "settings" ? selectedIsPalworld ? <PalworldSettingsTab server={selected} status={selectedStatus} onUpdated={updateServer} notify={setToast} fail={setError} /> : <SettingsTab server={selected} serverIcon={serverIcons[selected.id]} onServerIconChanged={updateServerIcon} status={selectedStatus} onUpdated={updateServer} notify={setToast} fail={setError} /> : null}
                </Suspense>
              </>
            )
          ) : null}
        </main>
      </div>

      <Suspense fallback={null}>
      {showWizard ? <CreateServerWizard initialTemplateId={initialTemplateId} isFirstServer={servers.length === 0} onClose={() => { setShowWizard(false); setInitialTemplateId(undefined); }} onCreated={(server) => { setServers((current) => [...current, server]); setSelectedId(server.id); setActiveTab("overview"); setActiveSection("home"); setShowWizard(false); setInitialTemplateId(undefined); setToast("サーバーを作成しました"); }} /> : null}
      {showImport ? <ImportServerWizard onClose={() => setShowImport(false)} onImported={(server) => { setServers((current) => [...current, server]); setSelectedId(server.id); setActiveTab("overview"); setShowImport(false); setToast("既存サーバーを読み取り登録しました"); }} /> : null}
      {showInvite && selected ? selectedIsPalworld ? <PalworldInviteDialog key={selected.id} server={selected} onClose={() => setShowInvite(false)} notify={setToast} /> : <InviteDialog server={selected} status={selectedStatus} onClose={() => setShowInvite(false)} notify={setToast} /> : null}
      {showCrossplayInvite && selected?.serverType === "paper" ? <CrossplayInviteDialog server={selected} status={selectedStatus} onClose={() => setShowCrossplayInvite(false)} notify={setToast} /> : null}
      {showAccount ? <AccountDialog locale={locale} onClose={() => setShowAccount(false)} /> : null}
      {showAppSettings ? <AppSettingsDialog server={selected} status={selected ? selectedStatus : undefined} servers={servers} statuses={statuses} onStatusesChanged={(values) => setStatuses((current) => ({ ...current, ...values }))} onAppearanceChanged={theme.setAppearance} onClose={() => setShowAppSettings(false)} notify={setToast} fail={setError} /> : null}
      {deleteTarget ? <DeleteServerDialog server={deleteTarget} status={statuses[deleteTarget.id] ?? stoppedStatus(deleteTarget)} onClose={() => setDeleteTarget(undefined)} fail={setError} onDeleted={(result: DeleteServerResult) => {
        const next = servers.filter((item) => item.id !== deleteTarget.id);
        setServers(next);
        setStatuses((current) => { const updated = { ...current }; delete updated[deleteTarget.id]; return updated; });
        try { updateServerIcon(deleteTarget.id, undefined); } catch { /* Registration deletion must not fail because local appearance storage is unavailable. */ }
        if (selectedId === deleteTarget.id) { setSelectedId(next[0]?.id); setActiveTab("overview"); }
        setDeleteTarget(undefined);
        setToast(result.deletedFiles ? "最終バックアップを作成し、サーバーフォルダーを削除しました" : "サーバーを一覧から外しました（ファイルは残っています）");
      }} /> : null}
      </Suspense>
      {error ? <div className="global-error" role="alert"><Icon name="info" /><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="エラーを閉じる"><Icon name="close" size={18} /></button></div> : null}
      {toast ? <div className="toast" role="status"><Icon name="check" size={18} />{toast}</div> : null}
      {busyAction ? <Suspense fallback={null}>{selectedIsPalworld
        ? <PalworldBusyOverlay action={busyAction} />
        : <OperationOverlay
          title={busyAction === "start" ? "サーバーを起動しています" : busyAction === "stop" ? "サーバーを安全に停止しています" : "サーバーを再起動しています"}
          detail="プロセスとポートの状態を確認しています。ワールドの読み込みや保存には時間がかかる場合があります。"
          stages={busyAction === "stop" ? ["保存要求", "停止確認", "状態更新"] : ["起動要求", "待受確認", "状態更新"]}
        />}</Suspense> : null}
      {showMigrationNotice ? <MigrationNoticeDialog locale={locale} onClose={() => { dismissMigrationNotice(); setShowMigrationNotice(false); }} /> : null}
    </div>
  );
}

export default function App() {
  return <I18nProvider><AppContent /></I18nProvider>;
}
