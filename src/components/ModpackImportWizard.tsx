import { useMemo, useState } from "react";
import { useI18n } from "../lib/i18n";
import { backend, selectModpackDestination, selectModpackFolder, selectModpackSource } from "../lib/backend";
import { translateGeneratedText } from "../lib/documentTranslation";
import type { ModManagementState, ModpackPlan, ServerProfile } from "../types";
import { Icon } from "./Icon";

const stageLabels = ["入力", "対象", "分類", "未解決／配布", "作成計画"];

function roleLabel(role: string, localized: (value: string) => string) {
  return localized(({ "server-only": "サーバー用", "client-only": "クライアント用", both: "両方", "client-optional": "任意クライアント", unknown: "未確認" } as Record<string, string>)[role] ?? role);
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export function ModpackImportWizard({
  server,
  state,
  onClose,
  notify,
  fail,
}: {
  server: ServerProfile;
  state?: ModManagementState;
  onClose: () => void;
  notify: (message: string) => void;
  fail: (message: string) => void;
}) {
  const { locale } = useI18n();
  const localized = (value: string) => translateGeneratedText(value, locale);
  const [stage, setStage] = useState(0);
  const [source, setSource] = useState<string>();
  const [plan, setPlan] = useState<ModpackPlan>();
  const [destination, setDestination] = useState<string>();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const target = useMemo(() => state?.target ?? {
    game: "minecraft-java",
    minecraftVersion: server.minecraftVersion,
    loader: server.serverType,
    loaderVersion: server.distributionBuild,
    javaMajor: server.javaMajor,
  }, [server, state]);

  const chooseSource = async (folder = false) => {
    try {
      const selected = folder ? await selectModpackFolder() : await selectModpackSource();
      if (!selected) return;
      setBusy(true);
      const nextPlan = await backend.analyzeModpackSource(selected, target);
      setSource(selected);
      setPlan(nextPlan);
      setStage(1);
      notify(localized("Modパックを読み取り専用で解析しました。元ファイルは変更していません"));
    } catch (reason) {
      fail(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!source || !plan || !destination) return;
    try {
      setBusy(true);
      const result = await backend.createModpackConfiguration(source, destination, plan.planFingerprint, confirmation, target);
      notify(`${localized("新規構成を作成しました。既存DBへは登録していません")} · ${result.destinationName} · ${localized("サーバー用JARをコピー")}: ${result.stagedArtifacts}`);
      onClose();
    } catch (reason) {
      fail(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const canNext = stage === 0 ? Boolean(plan) : stage < 4 ? Boolean(plan) : Boolean(plan && source);
  const roleCounts = plan?.artifacts.reduce<Record<string, number>>((counts, artifact) => {
    counts[artifact.role] = (counts[artifact.role] ?? 0) + 1;
    return counts;
  }, {}) ?? {};

  return <div className="modal-backdrop modpack-import-backdrop">
    <section className="wizard modpack-import-wizard" role="dialog" aria-modal="true" aria-labelledby="modpack-import-title" aria-busy={busy}>
      <header className="wizard-header"><div><p className="wizard-kicker">MOD MANAGEMENT V2 · M4</p><h2 id="modpack-import-title">{localized("Modパックから新規構成を作成")}</h2><p>{localized("入力は読み取り専用で解析し、確認済みのローカルJARだけを新しい空フォルダーへコピーします。")}</p></div><button className="icon-button" type="button" onClick={onClose} aria-label={localized("閉じる")} disabled={busy}><Icon name="close" /></button></header>
      <nav className="wizard-steps" aria-label={localized("Modパック取込の手順")}>{stageLabels.map((label, index) => <span className={stage === index ? "active" : index < stage ? "done" : ""} key={label}><b>{index + 1}</b>{localized(label)}</span>)}</nav>

      {stage === 0 ? <div className="modpack-wizard-stage"><h3>{localized("1. ファイル／フォルダーを選択")}</h3><p>{localized("CurseForge export ZIP、CurseForgeローカルprofile、Modrinth .mrpack、または既存modsフォルダーを選択できます。展開・実行・ネットワーク取得は行いません。")}</p><div className="modpack-source-actions"><button className="primary-button" type="button" onClick={() => void chooseSource()} disabled={busy}><Icon name="folder" size={17} />{localized(busy ? "解析中…" : "Modパックファイルを選択")}</button><button className="secondary-button" type="button" onClick={() => void chooseSource(true)} disabled={busy}><Icon name="folder" size={17} />{localized("mods／profileフォルダーを選択")}</button></div>{source ? <p className="modpack-source-note">{localized("選択済み")}: {source.split(/[\\/]/).pop()}</p> : null}<div className="modpack-safety-grid"><span><Icon name="check" size={16} />{localized("ZIP安全検査")}</span><span><Icon name="check" size={16} />{localized("元ファイル不変")}</span><span><Icon name="check" size={16} />{localized("ネットワーク不要")}</span></div></div> : null}

      {stage === 1 && plan ? <div className="modpack-wizard-stage"><h3>{localized("2. 対象を確認")}</h3><div className="modpack-target-grid"><div><span>Minecraft</span><strong>{plan.target.minecraftVersion || localized("未確認")}</strong></div><div><span>Loader</span><strong>{plan.target.loader || localized("未確認")}{plan.target.loaderVersion ? ` ${plan.target.loaderVersion}` : ""}</strong></div><div><span>Java</span><strong>{plan.target.javaMajor || localized("未確認")}</strong></div></div><p className="inline-warning"><Icon name="info" size={16} />{localized("対象が未確認でも自動補完しません。既存サーバーの対象を使う場合は、作成前に必ず確認してください。")}</p></div> : null}

      {stage === 2 && plan ? <div className="modpack-wizard-stage"><h3>{localized("3. サーバー用／クライアント用を分類")}</h3><div className="modpack-role-grid">{["server-only", "both", "client-only", "client-optional", "unknown"].map((role) => <div key={role}><span>{roleLabel(role, localized)}</span><strong>{localized(`${roleCounts[role] ?? 0}件`)}</strong></div>)}</div><div className="modpack-artifact-list">{plan.artifacts.map((artifact) => <div key={artifact.artifactId}><strong>{artifact.fileName}</strong><span>{roleLabel(artifact.role, localized)} · {formatSize(artifact.sizeBytes)}</span>{artifact.role === "unknown" ? <em>{localized("未確認は作成先へ配置しません")}</em> : null}</div>)}</div></div> : null}

      {stage === 3 && plan ? <div className="modpack-wizard-stage"><h3>{localized("4. 未解決依存と再配布条件")}</h3>{plan.unresolvedDependencies.length ? <div className="modpack-unresolved-list"><strong>{localized(`未解決（${plan.unresolvedDependencies.length}件）`)}</strong>{plan.unresolvedDependencies.map((item, index) => <p key={`${item.id}-${index}`}><Icon name="info" size={15} />{item.id} · {localized(item.reason)}</p>)}</div> : <p className="diagnosis-ok"><Icon name="check" size={16} />{localized("ローカルJARの必須依存は解決済みです。")}</p>}<div className="modpack-redistribution-list">{plan.redistribution.map((item) => <div key={item.subject}><strong>{item.subject}</strong><span className={item.allowed ? "allowed" : "blocked"}>{localized(item.allowed ? "ローカル同梱可" : "配布元から取得が必要")}</span><small>{localized(item.reason)}</small></div>)}</div></div> : null}

      {stage === 4 && plan ? <div className="modpack-wizard-stage"><h3>{localized("5. 適用計画を確認")}</h3><div className="modpack-plan-summary"><div><span>{localized("入力")}</span><strong>{plan.sourceName}</strong></div><div><span>{localized("サーバー用へコピー")}</span><strong>{localized(`${plan.artifacts.filter((artifact) => artifact.stageEligible).length}件`)}</strong></div><div><span>{localized("除外")}</span><strong>{localized(`${plan.artifacts.filter((artifact) => !artifact.stageEligible).length}件`)}</strong></div><div><span>{localized("計画fingerprint")}</span><code>{plan.planFingerprint}</code></div></div><p className="inline-warning"><Icon name="info" size={16} />{localized("既存サーバーへの適用は未実装で無効です。unknown、client-only、取得不能、再配布条件不明のJARはコピーしません。")}</p><button className="secondary-button" type="button" disabled>{localized("既存サーバーへ適用（M4未実装）")}</button><label className="modpack-destination-field"><span>{localized("空の新規destination")}</span><div><input value={destination ?? ""} onChange={(event) => setDestination(event.target.value)} placeholder={localized("フォルダーを選択してください")} readOnly /><button className="secondary-button" type="button" onClick={async () => setDestination((await selectModpackDestination(plan.sourceName)) ?? undefined)} disabled={busy}>{localized("選択")}</button></div></label><label className="modpack-confirm-field"><span>{localized("明示確認（入力必須）")}</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={`CREATE MODPACK ${plan.planFingerprint}`} /><small>{localized("確認文字列は計画fingerprintと一致する必要があります。")}</small></label><button className="primary-button" type="button" onClick={() => void create()} disabled={busy || !destination || confirmation.trim() !== `CREATE MODPACK ${plan.planFingerprint}` || !plan.artifacts.some((artifact) => artifact.stageEligible)}><Icon name="add" size={17} />{localized(busy ? "作成中…" : "新規構成を作成")}</button></div> : null}

      <footer className="wizard-footer"><button className="secondary-button" type="button" onClick={() => setStage((value) => Math.max(0, value - 1))} disabled={stage === 0 || busy}>{localized("戻る")}</button>{stage < 4 ? <button className="primary-button" type="button" onClick={() => setStage((value) => Math.min(4, value + 1))} disabled={!canNext || busy}>{localized("次へ")}</button> : null}</footer>
    </section>
  </div>;
}
