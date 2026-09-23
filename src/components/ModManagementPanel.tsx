import { useMemo, useState } from "react";
import { useI18n } from "../lib/i18n";
import { translateGeneratedText } from "../lib/documentTranslation";
import type { ModLaunchAttempt, ModManagementArtifact, ModManagementState, ModQuarantineOverview, ModQuarantineSelection, ModRole, ServerProfile } from "../types";
import { Icon } from "./Icon";
import { ModpackImportWizard } from "./ModpackImportWizard";

type ModManagementView = "server" | "client" | "embedded" | "history";
const APPLY_QUARANTINE_CONFIRMATION = "隔離を実行";
const RESTORE_QUARANTINE_CONFIRMATION = "復元を実行";

const quarantineStatusLabels: Record<string, string> = {
  planned: "計画済み",
  "backup-created": "バックアップ済み",
  "move-started": "隔離中断の確認が必要",
  "one-file-moved": "一部隔離・確認が必要",
  quarantined: "隔離済み・検査待ち",
  rechecking: "再検査の確認が必要",
  "awaiting-launch-validation": "次回起動の検証待ち",
  restoring: "復元中断の確認が必要",
  "needs-recovery": "要確認",
  committed: "起動検証済み",
  restored: "復元済み",
};

const roleLabels: Record<string, string> = {
  "server-only": "サーバー用",
  "client-only": "クライアント用",
  both: "両方",
  "client-optional": "任意クライアント",
  unknown: "未確認",
};

function metadataIds(artifact: ModManagementArtifact) {
  return artifact.topLevelMods
    .map((item) => typeof item.id === "string" ? item.id : "")
    .filter(Boolean)
    .join(", ");
}

function evidenceLabel(value: string, localized: (value: string) => string) {
  if (value.startsWith("strong:")) return `${localized("強い根拠")} · ${value.slice("strong:".length)}`;
  if (value.startsWith("weak:")) return `${localized("弱いヒューリスティック")} · ${value.slice("weak:".length)}`;
  return localized(value);
}

function artifactMatchesView(artifact: ModManagementArtifact, view: ModManagementView) {
  if (view === "server") return artifact.kind === "mod"
    && artifact.active
    && artifact.present
    // Unknown remains visible for confirmation and legacy preflight parity;
    // client-optional is server-required, while client-only is excluded.
    && ["server-only", "client-optional", "both", "unknown"].includes(artifact.role);
  if (view === "client") {
    return artifact.kind === "mod"
      && artifact.active
      && artifact.present
      && ["client-only", "both", "client-optional"].includes(artifact.role);
  }
  return false;
}

export function ModManagementPanel({
  server,
  state,
  attempts = [],
  quarantine,
  runtimeState = "unknown",
  busy,
  onRefresh,
  onExport,
  onOverride,
  onApplyQuarantine = async () => undefined,
  onRestoreQuarantine = async () => undefined,
  onNotify = () => undefined,
  onFail = () => undefined,
}: {
  server: ServerProfile;
  state?: ModManagementState;
  attempts?: ModLaunchAttempt[];
  quarantine?: ModQuarantineOverview;
  runtimeState?: string;
  busy: boolean;
  onRefresh: () => void;
  onExport: () => void;
  onOverride: (artifact: ModManagementArtifact, role: ModRole) => void;
  onApplyQuarantine?: (selections: ModQuarantineSelection[], confirmation: string) => Promise<void>;
  onRestoreQuarantine?: (operationId: string, confirmation: string) => Promise<void>;
  onNotify?: (message: string) => void;
  onFail?: (message: string) => void;
}) {
  const { locale } = useI18n();
  const localized = (value: string) => translateGeneratedText(value, locale);
  const [view, setView] = useState<ModManagementView>("server");
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [selectedQuarantine, setSelectedQuarantine] = useState<Record<string, string>>({});
  const [quarantineConfirmation, setQuarantineConfirmation] = useState("");
  const [restoreOperationId, setRestoreOperationId] = useState("");
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const artifacts = state?.artifacts ?? [];
  const serverItems = useMemo(() => artifacts.filter((item) => artifactMatchesView(item, "server")), [artifacts]);
  const clientItems = useMemo(() => artifacts.filter((item) => artifactMatchesView(item, "client")), [artifacts]);
  const embeddedParents = useMemo(() => artifacts.filter((item) => item.kind === "mod" && item.embedded.length > 0), [artifacts]);
  const unknownCount = serverItems.filter((item) => item.role === "unknown").length;
  const roleCount = (role: string) => artifacts.filter((item) => item.kind === "mod" && item.active && item.present && item.role === role).length;
  const quarantineCandidates = quarantine?.candidates ?? [];
  const selectedQuarantineItems = quarantineCandidates
    .filter((candidate) => candidate.valid && selectedQuarantine[candidate.relativePath] === candidate.sha256)
    .map((candidate) => ({ relativePath: candidate.relativePath, sha256: candidate.sha256 }));
  const recommendedQuarantineNames = new Set(attempts.flatMap((attempt) => attempt.quarantineCandidates
    .map((candidate) => candidate.fileName?.toLocaleLowerCase())
    .filter((name): name is string => Boolean(name))));
  const canOperateOnQuarantine = runtimeState === "stopped" && !busy;

  const toggleQuarantineCandidate = (relativePath: string, sha256: string, checked: boolean) => {
    setSelectedQuarantine((current) => {
      const next = { ...current };
      if (checked) next[relativePath] = sha256;
      else delete next[relativePath];
      return next;
    });
  };

  const submitQuarantine = async () => {
    try {
      await onApplyQuarantine(selectedQuarantineItems, quarantineConfirmation);
      setSelectedQuarantine({});
      setQuarantineConfirmation("");
    } catch (reason) {
      onFail(String(reason));
    }
  };

  const submitRestore = async (operationId: string) => {
    try {
      await onRestoreQuarantine(operationId, restoreConfirmation);
      setRestoreOperationId("");
      setRestoreConfirmation("");
    } catch (reason) {
      onFail(String(reason));
    }
  };

  return <>
  <section className="feature-panel mod-management-panel" aria-label={localized("Mod構成")}>
    <header className="mod-management-header">
      <div>
        <span className="section-kicker">MOD MANAGEMENT V2 · M3 / M4 / M5 / M6</span>
        <h2>{localized("サーバー／クライアント構成")}</h2>
        <p>{localized("既存のModを読み取り、根拠の強さを分けて整理します。未確認の項目は自動で配置先を決めません。")}</p>
      </div>
      <div className="mod-management-actions">
        <button className="secondary-button" type="button" onClick={() => setShowImportWizard(true)} disabled={busy}><Icon name="add" size={17} />{localized("Modパックを解析")}</button>
        <button className="secondary-button" type="button" onClick={onRefresh} disabled={busy}><Icon name="restart" size={17} />{localized(busy ? "検査中…" : "再スキャン")}</button>
        <span className="status-pill">{state ? `${state.target.minecraftVersion} · ${state.target.loader}${state.target.loaderVersion ? ` ${state.target.loaderVersion}` : ""}` : localized("読み込み中…")}</span>
      </div>
    </header>

    <div className="mod-management-summary" aria-label={localized("サーバー構成の概要")}>
      <div><span>Minecraft</span><strong>{state?.target.minecraftVersion ?? server.minecraftVersion}</strong></div>
      <div><span>Loader</span><strong>{state?.target.loader ?? server.serverType}{state?.target.loaderVersion ? ` ${state.target.loaderVersion}` : ""}</strong></div>
      <div><span>Java</span><strong>{state?.target.javaMajor || server.javaMajor}</strong></div>
      <div><span>{localized("サーバー用Mod")}</span><strong>{localized(`${roleCount("server-only") + roleCount("client-optional") + roleCount("both") + unknownCount}件`)}</strong></div>
      <div><span>{localized("クライアント用Mod")}</span><strong>{localized(`${clientItems.length}件`)}</strong></div>
      <div><span>{localized("未確認")}</span><strong>{localized(`${unknownCount}件`)}</strong></div>
    </div>

    <nav className="mod-management-tabs" aria-label={localized("Mod構成の分類")}>
      {(["server", "client", "embedded", "history"] as ModManagementView[]).map((item) => <button key={item} type="button" className={view === item ? "active" : ""} onClick={() => setView(item)}>
        {item === "server" ? localized(`サーバー用 (${serverItems.length})`) : item === "client" ? localized(`クライアント用 (${clientItems.length})`) : item === "embedded" ? localized(`内蔵ライブラリ (${embeddedParents.reduce((sum, parent) => sum + parent.embedded.length, 0)})`) : localized("隔離・履歴")}
      </button>)}
    </nav>

    {view === "client" ? <div className="mod-management-toolbar"><p>{localized("client-only / both / 任意クライアントだけを案内します。JARは同梱・コピーせず、ハッシュと取得情報のみJSONへ出力します。")}</p><button className="primary-button" type="button" onClick={onExport} disabled={busy || clientItems.length === 0}><Icon name="download" size={17} />{localized("クライアント用JSONを出力")}</button></div> : null}
    {view === "history" ? <div className="mod-launch-history">
      <p className="privacy-note">{localized("起動ログは上限付き・秘密情報／IP／絶対パスを伏せ字にして保存します。候補は提案だけで、ファイルの移動・削除・隔離は自動では行いません。")}</p>
      {attempts.map((attempt) => <details className="mod-launch-attempt" key={attempt.attemptId} open={attempt === attempts[0]}>
        <summary><span className={`status-pill mod-launch-${attempt.state}`}>{localized(attempt.state === "ready" ? "Ready" : attempt.state === "failed" ? "失敗" : attempt.state === "exited" ? "終了" : "起動中")}</span><strong>{attempt.target.loader}{attempt.target.loaderVersion ? ` ${attempt.target.loaderVersion}` : ""}</strong><span>{new Date(attempt.startedAt).toLocaleString()}</span>{attempt.fatalCode ? <em>{attempt.fatalCode}</em> : null}</summary>
        <div className="mod-launch-attempt-body">
          <div className="mod-launch-facts"><span>{localized("開始")}: {attempt.startedAt}</span>{attempt.readyAt ? <span>Ready: {attempt.readyAt}</span> : null}{attempt.endedAt ? <span>{localized("終了")}: {attempt.endedAt}</span> : null}{attempt.exitCode !== null && attempt.exitCode !== undefined ? <span>{localized("終了コード")}: {attempt.exitCode}</span> : null}</div>
          {attempt.warningCodes.length ? <p className="inline-warning">{localized("警告")}: {attempt.warningCodes.join(", ")}</p> : null}
          {attempt.quarantineCandidates.length ? <div><strong>{localized("隔離候補（提案のみ）")}</strong><ul>{attempt.quarantineCandidates.map((candidate, index) => <li key={`${attempt.attemptId}-candidate-${index}`}>{candidate.fileName ?? candidate.modId ?? localized("候補不明")} · {candidate.reason}</li>)}</ul></div> : null}
          <ul className="mod-launch-evidence">{attempt.logEvidence.slice(-8).map((entry, index) => <li key={`${attempt.attemptId}-evidence-${index}`}><span>{entry.level}</span> {entry.message}</li>)}</ul>
        </div>
      </details>)}
      {attempts.length === 0 ? <div className="mod-management-empty"><Icon name="info" size={20} /><p>{localized("起動試行履歴はまだありません。Ready marker到達後にここへ保存されます。")}</p></div> : null}
      <section className="mod-quarantine" aria-label={localized("Mod隔離と復元")}>
        <header><div><span className="section-kicker">BACKUP · QUARANTINE · VALIDATE</span><h3>{localized("隔離候補と操作履歴")}</h3></div></header>
        <p className="privacy-note">{localized("表示する候補はmods直下のJAR全体です。起動履歴の候補は目印だけに使い、選択・移動は自動で行いません。隔離前にバックアップを作成し、元パスとSHA-256を記録します。")}</p>
        {runtimeState !== "stopped" ? <p className="inline-warning" role="status">{localized(`隔離・復元にはサーバーが完全停止している必要があります。現在の状態: ${runtimeState}`)}</p> : null}
        <div className="mod-quarantine-candidates">
          <h4>{localized("mods直下のJAR")}</h4>
          {quarantineCandidates.map((candidate) => {
            const selected = selectedQuarantine[candidate.relativePath] === candidate.sha256;
            const recommended = recommendedQuarantineNames.has(candidate.fileName.toLocaleLowerCase());
            return <label className={`mod-quarantine-candidate ${candidate.valid ? "" : "is-invalid"}`} key={candidate.relativePath}>
              <input
                type="checkbox"
                aria-label={localized(`${candidate.fileName}を隔離対象に選択`)}
                checked={selected}
                disabled={!canOperateOnQuarantine || !candidate.valid}
                onChange={(event) => toggleQuarantineCandidate(candidate.relativePath, candidate.sha256, event.target.checked)}
              />
              <span><strong>{candidate.fileName}</strong><small>{candidate.sizeBytes.toLocaleString()} bytes · SHA-256 {candidate.sha256 ? `${candidate.sha256.slice(0, 16)}…` : "未確認"}{candidate.reasons.length ? ` · ${candidate.reasons.join("、")}` : ""}</small></span>
              {recommended ? <span className="status-pill">{localized("起動履歴の候補")}</span> : null}
            </label>;
          })}
          {quarantine && quarantineCandidates.length === 0 ? <p className="mod-management-empty">{localized("隔離対象として確認できるJARはありません。")}</p> : null}
          {!quarantine ? <p className="mod-management-empty">{localized("隔離候補を読み込んでいます…")}</p> : null}
        </div>
        <div className="mod-quarantine-confirm">
          <label htmlFor="mod-quarantine-confirmation">{localized("確認のため「隔離を実行」と入力")}</label>
          <input id="mod-quarantine-confirmation" aria-label={localized("隔離確認文")} value={quarantineConfirmation} onChange={(event) => setQuarantineConfirmation(event.target.value)} disabled={!canOperateOnQuarantine} />
          <button className="danger-button" type="button" disabled={!canOperateOnQuarantine || selectedQuarantineItems.length === 0 || quarantineConfirmation !== APPLY_QUARANTINE_CONFIRMATION} onClick={() => void submitQuarantine()}>
            {busy ? localized("バックアップ・隔離中…") : localized(`選択した${selectedQuarantineItems.length}件をバックアップして隔離`)}
          </button>
        </div>
        <div className="mod-quarantine-operations">
          <h4>{localized("隔離操作の状態")}</h4>
          {(quarantine?.operations ?? []).map((operation) => <article className="mod-quarantine-operation" key={operation.operationId}>
            <div className="mod-quarantine-operation-heading"><span className={`status-pill quarantine-status-${operation.status}`}>{localized(quarantineStatusLabels[operation.status] ?? operation.status)}</span><time>{new Date(operation.updatedAt).toLocaleString()}</time></div>
            <div className="mod-quarantine-operation-facts"><span>{localized("操作ID")}: {operation.operationId}</span><span>{localized("段階")}: {operation.stage}</span><span>{localized("バックアップ")}: {operation.backupId ?? localized("未作成")}</span>{operation.launchValidation.outcome ? <span>{localized("起動検証")}: {localized(operation.launchValidation.outcome)}</span> : null}{operation.launchValidation.readyAt ? <span>Ready: {operation.launchValidation.readyAt}</span> : null}</div>
            <ul>{operation.selected.map((item) => <li key={`${operation.operationId}-${item.sourceRelativePath}`}><strong>{item.fileName}</strong><small>{localized("元パス")}: mods/{item.sourceRelativePath} · SHA-256 {item.sha256.slice(0, 16)}… · {localized(item.restored ? "復元済み" : item.moved ? "隔離済み" : "未移動")}</small></li>)}</ul>
            {operation.lastError ? <p className="inline-warning">{localized("確認が必要")}: {localized(operation.lastError)}</p> : null}
            {operation.status !== "restored" ? <div className="mod-quarantine-restore">
              {restoreOperationId === operation.operationId ? <>
                <label htmlFor={`restore-confirmation-${operation.operationId}`}>{localized("確認のため「復元を実行」と入力")}</label>
                <input id={`restore-confirmation-${operation.operationId}`} aria-label={localized(`${operation.operationId}の復元確認文`)} value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} disabled={!canOperateOnQuarantine} />
                <button className="secondary-button" type="button" disabled={!canOperateOnQuarantine || restoreConfirmation !== RESTORE_QUARANTINE_CONFIRMATION} onClick={() => void submitRestore(operation.operationId)}>{localized("上書きせずに元パスへ復元")}</button>
              </> : <button className="secondary-button" type="button" disabled={!canOperateOnQuarantine} onClick={() => { setRestoreOperationId(operation.operationId); setRestoreConfirmation(""); }}>{localized("この操作を復元")}</button>}
            </div> : null}
            {operation.status === "awaiting-launch-validation" ? <p className="privacy-note">{localized("この操作より後に開始した新しい起動がReady markerへ到達すると確定します。起動失敗は要確認になり、自動復元しません。")}</p> : null}
            {operation.status === "needs-recovery" ? <p className="privacy-note">{localized("再オープン後に途中段階または外部変更を確認しました。ハッシュを照合し、上書きせず明示的に復元してください。")}</p> : null}
            <p className="privacy-note">{localized(operation.recoveryGuidance)}</p>
          </article>)}
          {quarantine && quarantine.operations.length === 0 ? <p className="mod-management-empty">{localized("隔離操作履歴はありません。")}</p> : null}
        </div>
      </section>
    </div> : null}
    {view === "embedded" ? <div className="mod-management-list embedded-list">{embeddedParents.map((parent) => <article key={parent.artifactId}>
      <div className="mod-artifact-heading"><span className="extension-state enabled"><Icon name="plugin" /></span><div><strong>{parent.fileName}</strong><small>{metadataIds(parent) || "Mod ID未確認"} · 親JAR</small></div></div>
      <ul>{parent.embedded.map((item, index) => <li key={`${parent.artifactId}-${index}`}><strong>{Array.isArray(item.ids) ? item.ids.filter((id): id is string => typeof id === "string").join(", ") : localized("内蔵ID未確認")}</strong><small>{typeof item.path === "string" ? item.path : "Jar-in-Jar"} · {localized("内蔵のためトップレベル重複には数えません")}</small></li>)}</ul>
    </article>)}{embeddedParents.length === 0 ? <div className="mod-management-empty"><Icon name="info" size={20} /><p>{localized("内蔵ライブラリは見つかりませんでした。")}</p></div> : null}</div> : null}
    {view === "server" || view === "client" ? <div className="mod-management-list">{(view === "server" ? serverItems : clientItems).map((artifact) => <article key={artifact.artifactId} className={artifact.role === "unknown" ? "is-unknown" : ""}>
          <div className="mod-artifact-heading"><span className={`extension-state ${artifact.active ? "enabled" : ""}`}><Icon name="plugin" /></span><div><strong>{artifact.fileName}</strong><small>{metadataIds(artifact) || localized("Mod ID未確認")} · {artifact.origin.provider || "manual"}{artifact.origin.versionNumber ? ` · ${artifact.origin.versionNumber}` : ""}</small></div><span className={`status-pill mod-role-${artifact.role}`}>{localized(roleLabels[artifact.role] ?? artifact.role)}</span></div>
      <div className="mod-artifact-meta"><span>SHA-256: {artifact.artifactId.replace(/^sha256:/, "").slice(0, 16)}…</span><span>{artifact.origin.projectId ? `project ${artifact.origin.projectId}` : localized("配布元ID未確認")}</span></div>
      <div className="mod-artifact-evidence">{artifact.roleEvidence.length ? artifact.roleEvidence.map((evidence) => <span key={evidence} className={evidence.startsWith("strong:") ? "strong-evidence" : "weak-evidence"}>{evidenceLabel(evidence, localized)}</span>) : <span className="weak-evidence">{localized("根拠なし · 未確認")}</span>}</div>
      {artifact.active && artifact.present ? <label className="mod-role-override">{localized(artifact.role === "unknown" ? "確認して分類" : "分類を再確認")}（{artifact.fileName}）
        <select aria-label={localized(`${artifact.fileName}の分類`)} value={artifact.role} onChange={(event) => onOverride(artifact, event.target.value)} disabled={busy}>
          <option value="unknown">{localized("未確認のまま")}</option><option value="server-only">{localized("サーバー用")}</option><option value="client-only">{localized("クライアント用")}</option><option value="both">{localized("両方")}</option><option value="client-optional">{localized("任意クライアント")}</option>
        </select>
      </label> : null}
    </article>)}{(view === "server" ? serverItems : clientItems).length === 0 ? <div className="mod-management-empty"><Icon name="info" size={20} /><p>{localized(view === "server" ? "有効なトップレベルModはありません。" : "クライアントへ案内できる確定済みModはありません。未確認は自動で含めません。")}</p></div> : null}</div> : null}
  </section>
  {showImportWizard ? <ModpackImportWizard server={server} state={state} onClose={() => setShowImportWizard(false)} notify={onNotify} fail={onFail} /> : null}
  </>;
}

export function ModManagementSummaryCard({
  state,
  onOpen,
}: {
  state?: ModManagementState;
  onOpen: () => void;
}) {
  const { locale } = useI18n();
  const localized = (value: string) => translateGeneratedText(value, locale);
  const artifacts = state?.artifacts ?? [];
  const activeMods = artifacts.filter((item) => item.kind === "mod" && item.active && item.present);
  const serverCount = activeMods.filter((item) => ["server-only", "client-optional", "both", "unknown"].includes(item.role)).length;
  const clientCount = activeMods.filter((item) => ["client-only", "both", "client-optional"].includes(item.role)).length;
  const unknownCount = activeMods.filter((item) => item.role === "unknown").length;
  return <section className="feature-panel mod-overview-card" aria-label={localized("サーバー構成")}>
    <header><div><span className="section-kicker">SERVER CONFIGURATION · MOD V2</span><h2>{localized("サーバー構成")}</h2><p>{state ? `${state.target.minecraftVersion} · ${state.target.loader}${state.target.loaderVersion ? ` ${state.target.loaderVersion}` : ""} · Java ${state.target.javaMajor}` : localized("Mod構成を読み込んでいます…")}</p></div><button className="small-button" type="button" onClick={onOpen}>{localized("Mod構成を開く")}</button></header>
    <div className="mod-overview-facts"><div><span>{localized("サーバー用Mod")}</span><strong>{localized(`${serverCount}件`)}</strong></div><div><span>{localized("クライアント用Mod")}</span><strong>{localized(`${clientCount}件`)}</strong></div><div><span>{localized("未確認")}</span><strong>{localized(`${unknownCount}件`)}</strong></div><div><span>{localized("最終起動検証")}</span><strong>{localized(state?.lastSuccessfulLaunch ? "成功" : "未確認")}</strong></div></div>
  </section>;
}
