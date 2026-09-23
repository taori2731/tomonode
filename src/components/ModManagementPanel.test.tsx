import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../lib/i18n";
import type { ModManagementState, ServerProfile } from "../types";
import { ModManagementPanel } from "./ModManagementPanel";

function renderInLocale(ui: ReactNode, locale: "en" | "ja") {
  localStorage.setItem("server-hub:language:v1", locale);
  return render(<I18nProvider>{ui}</I18nProvider>);
}

const renderJapanese = (ui: ReactNode) => renderInLocale(ui, "ja");

const server = {
  id: "m3",
  name: "M3",
  rootPath: "C:\\Servers\\M3",
  gameKind: "minecraft" as const,
  serverType: "forge" as const,
  minecraftVersion: "1.20.1",
  distributionBuild: "1.20.1-47.4.10",
  launchTarget: "run.bat",
  javaPath: "java.exe",
  javaMajor: 17,
  minMemoryMib: 1024,
  maxMemoryMib: 4096,
  port: 25565,
  eulaAcceptedAt: "test",
  pendingRestart: false,
  settings: {} as ServerProfile["settings"],
  createdAt: "test",
  updatedAt: "test",
} satisfies ServerProfile;

const state: ModManagementState = {
  schemaVersion: 1,
  serverId: server.id,
  target: { game: "minecraft-java", minecraftVersion: "1.20.1", loader: "forge", loaderVersion: "47.4.10", javaMajor: 17 },
  desiredSets: { server: ["sha256:server"], client: ["sha256:client"], optionalClient: [] },
  roleOverrides: [],
  artifacts: [
    { artifactId: "sha256:server", fileName: "server.jar", kind: "mod", active: true, present: true, topLevelMods: [{ id: "servermod", version: "1.0.0" }], embedded: [], role: "server-only", roleEvidence: ["strong:forge-metadata-side-server"], dependencies: [], origin: { provider: "modrinth", projectId: "server", versionId: "v1", versionNumber: "1.0.0" } },
    { artifactId: "sha256:client", fileName: "client-hud.jar", kind: "mod", active: true, present: true, topLevelMods: [{ id: "hud", version: "1.0.0" }], embedded: [{ path: "META-INF/jarjar/mixinextras.jar", ids: ["mixinextras"], relationship: "bundled" }], role: "client-only", roleEvidence: ["strong:fabric-environment-client", "weak:filename-client-token"], dependencies: [], origin: { provider: "manual" } },
    { artifactId: "sha256:unknown", fileName: "mystery.jar", kind: "mod", active: true, present: true, topLevelMods: [], embedded: [], role: "unknown", roleEvidence: ["weak:role-unresolved"], dependencies: [], origin: { provider: "manual" } },
  ],
  lastSuccessfulLaunch: null,
  updatedAt: "test",
};

describe("ModManagementPanel", () => {
  it("shows role evidence, keeps unknown visible, and separates embedded libraries", () => {
    const onOverride = vi.fn();
    renderJapanese(<ModManagementPanel server={server} state={state} busy={false} onRefresh={vi.fn()} onExport={vi.fn()} onOverride={onOverride} />);
    expect(screen.getByText("サーバー用Mod")).toBeInTheDocument();
    expect(screen.getByText("server.jar")).toBeInTheDocument();
    expect(screen.getByText("mystery.jar")).toBeInTheDocument();
    expect(screen.getByText("強い根拠 · forge-metadata-side-server")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "server.jarの分類" }), { target: { value: "both" } });
    expect(onOverride).toHaveBeenCalledWith(expect.objectContaining({ fileName: "server.jar" }), "both");
    fireEvent.change(screen.getByRole("combobox", { name: "mystery.jarの分類" }), { target: { value: "client-only" } });
    expect(onOverride).toHaveBeenCalledWith(expect.objectContaining({ fileName: "mystery.jar" }), "client-only");

    fireEvent.click(screen.getByRole("button", { name: /内蔵ライブラリ/ }));
    expect(screen.getByText("mixinextras")).toBeInTheDocument();
    expect(screen.getByText(/トップレベル重複には数えません/)).toBeInTheDocument();
  });

  it("offers client export only for known client-side artifacts", () => {
    const onExport = vi.fn();
    renderJapanese(<ModManagementPanel server={server} state={state} busy={false} onRefresh={vi.fn()} onExport={onExport} onOverride={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /クライアント用/ }));
    expect(screen.getByText("client-hud.jar")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "client-hud.jarの分類" })).toBeInTheDocument();
    expect(screen.queryByText("mystery.jar")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /クライアント用JSONを出力/ }));
    expect(onExport).toHaveBeenCalledOnce();
  });

  it("disables classification controls while a role override is being saved", () => {
    renderJapanese(<ModManagementPanel server={server} state={state} busy onRefresh={vi.fn()} onExport={vi.fn()} onOverride={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "server.jarの分類" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "mystery.jarの分類" })).toBeDisabled();
  });

  it("shows bounded launch evidence and quarantine candidates as proposals", () => {
    renderJapanese(<ModManagementPanel server={server} state={state} attempts={[{
      schemaVersion: 1,
      attemptId: "attempt-1",
      serverId: server.id,
      state: "failed",
      startedAt: "2026-09-22T10:00:00Z",
      endedAt: "2026-09-22T10:00:03Z",
      target: state.target,
      logEvidence: [{ timestamp: "2026-09-22T10:00:01Z", level: "ERROR", message: "ModLoadingException: example.jar" }],
      fatalCode: "mod-loading-exception",
      warningCodes: [],
      quarantineCandidates: [{ fileName: "example.jar", modId: "example", reason: "mod-loading-exception" }],
      exitCode: 1,
    }]} busy={false} onRefresh={vi.fn()} onExport={vi.fn()} onOverride={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "隔離・履歴" }));
    expect(screen.getByText("mod-loading-exception")).toBeInTheDocument();
    expect(screen.getByText(/隔離候補（提案のみ）/)).toBeInTheDocument();
    expect(screen.getByText("example.jar · mod-loading-exception")).toBeInTheDocument();
    expect(screen.getByText(/自動では行いません/)).toBeInTheDocument();
  });

  it("renders a cleanly exited attempt with post-Ready warnings in history", () => {
    renderJapanese(<ModManagementPanel server={server} state={state} attempts={[{
      schemaVersion: 1,
      attemptId: "attempt-exited",
      serverId: server.id,
      state: "exited",
      startedAt: "2026-09-22T10:00:00Z",
      readyAt: "2026-09-22T10:00:02Z",
      endedAt: "2026-09-22T10:01:00Z",
      target: state.target,
      logEvidence: [{ timestamp: "2026-09-22T10:00:03Z", level: "WARN", message: "Loot table warning" }],
      warningCodes: ["loot-table-warning", "deprecated-api"],
      quarantineCandidates: [],
      exitCode: 0,
    }]} busy={false} onRefresh={vi.fn()} onExport={vi.fn()} onOverride={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "隔離・履歴" }));
    expect(screen.getByText("終了")).toBeInTheDocument();
    expect(screen.getByText("警告: loot-table-warning, deprecated-api")).toBeInTheDocument();
    expect(screen.getByText(/Loot table warning/)).toBeInTheDocument();
    expect(screen.getByText("終了コード: 0")).toBeInTheDocument();
  });

  it("shows all backend JAR candidates without preselecting M5 recommendations and requires exact stopped confirmation", async () => {
    const onApplyQuarantine = vi.fn().mockResolvedValue(undefined);
    const candidateHash = "a".repeat(64);
    renderJapanese(<ModManagementPanel
      server={server}
      state={state}
      attempts={[{
        schemaVersion: 1,
        attemptId: "attempt-1",
        serverId: server.id,
        state: "failed",
        startedAt: "2026-09-22T10:00:00Z",
        endedAt: "2026-09-22T10:00:03Z",
        target: state.target,
        logEvidence: [],
        warningCodes: [],
        quarantineCandidates: [{ fileName: "client-hud.jar", modId: "hud", reason: "mod-loading-exception" }],
      }]}
      quarantine={{
        schemaVersion: 1,
        candidates: [{ relativePath: "client-hud.jar", fileName: "client-hud.jar", sha256: candidateHash, sizeBytes: 12, valid: true, reasons: [] }],
        operations: [],
      }}
      runtimeState="stopped"
      busy={false}
      onRefresh={vi.fn()}
      onExport={vi.fn()}
      onOverride={vi.fn()}
      onApplyQuarantine={onApplyQuarantine}
    />);
    fireEvent.click(screen.getByRole("button", { name: "隔離・履歴" }));

    const checkbox = screen.getByRole("checkbox", { name: "client-hud.jarを隔離対象に選択" });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText("起動履歴の候補")).toBeInTheDocument();
    fireEvent.click(checkbox);
    expect(screen.getByRole("button", { name: "選択した1件をバックアップして隔離" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "隔離確認文" }), { target: { value: "隔離を実行" } });
    fireEvent.click(screen.getByRole("button", { name: "選択した1件をバックアップして隔離" }));

    await waitFor(() => expect(onApplyQuarantine).toHaveBeenCalledWith(
      [{ relativePath: "client-hud.jar", sha256: candidateHash }],
      "隔離を実行",
    ));
  });

  it("allows explicit restore from recovery state only while stopped with its exact confirmation", async () => {
    const onRestoreQuarantine = vi.fn().mockResolvedValue(undefined);
    const operationId = "operation-restore-1";
    renderJapanese(<ModManagementPanel
      server={server}
      state={state}
      quarantine={{
        schemaVersion: 1,
        candidates: [],
        operations: [{
          schemaVersion: 1,
          operationId,
          serverId: server.id,
          status: "needs-recovery",
          stage: "reconcile-partial",
          selected: [{ sourceRelativePath: "client-hud.jar", quarantineRelativePath: "mods/client-hud.jar", fileName: "client-hud.jar", sha256: "b".repeat(64), moved: true, restored: false }],
          backupId: "backup-1",
          plannedAt: "2026-09-22T10:00:00Z",
          updatedAt: "2026-09-22T10:01:00Z",
          launchValidation: {},
          lastError: "復元先に外部変更があります",
          recoveryGuidance: "停止したまま確認してください。",
        }],
      }}
      runtimeState="stopped"
      busy={false}
      onRefresh={vi.fn()}
      onExport={vi.fn()}
      onOverride={vi.fn()}
      onRestoreQuarantine={onRestoreQuarantine}
    />);
    fireEvent.click(screen.getByRole("button", { name: "隔離・履歴" }));
    fireEvent.click(screen.getByRole("button", { name: "この操作を復元" }));
    expect(screen.getByRole("button", { name: "上書きせずに元パスへ復元" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: `${operationId}の復元確認文` }), { target: { value: "復元を実行" } });
    fireEvent.click(screen.getByRole("button", { name: "上書きせずに元パスへ復元" }));

    await waitFor(() => expect(onRestoreQuarantine).toHaveBeenCalledWith(operationId, "復元を実行"));
  });

  it("disables quarantine controls while the server is running", () => {
    renderJapanese(<ModManagementPanel
      server={server}
      quarantine={{ schemaVersion: 1, candidates: [{ relativePath: "example.jar", fileName: "example.jar", sha256: "c".repeat(64), sizeBytes: 10, valid: true, reasons: [] }], operations: [] }}
      runtimeState="running"
      busy={false}
      onRefresh={vi.fn()}
      onExport={vi.fn()}
      onOverride={vi.fn()}
    />);
    fireEvent.click(screen.getByRole("button", { name: "隔離・履歴" }));
    expect(screen.getByRole("checkbox", { name: "example.jarを隔離対象に選択" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "隔離確認文" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/完全停止/);
  });

  it("renders the M6 stopped-state warning and exact confirmation guidance in English", () => {
    renderInLocale(<ModManagementPanel
      server={server}
      state={state}
      quarantine={{ schemaVersion: 1, candidates: [{ relativePath: "client.jar", fileName: "client.jar", sha256: "d".repeat(64), sizeBytes: 8, valid: true, reasons: [] }], operations: [] }}
      runtimeState="running"
      busy={false}
      onRefresh={vi.fn()}
      onExport={vi.fn()}
      onOverride={vi.fn()}
    />, "en");

    fireEvent.click(screen.getByRole("button", { name: "Quarantine & history" }));
    expect(screen.getByRole("heading", { name: "Quarantine candidates & history" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Quarantine and restore require the server to be fully stopped. Current state: running");
    expect(screen.getByText('Type the exact Japanese phrase “隔離を実行” to confirm.')).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select client.jar for quarantine" })).toBeDisabled();
  });
});
