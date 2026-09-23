import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { backend } from "../lib/backend";
import { I18nProvider } from "../lib/i18n";
import type { ModManagementState, ModpackPlan, ServerProfile } from "../types";
import { ModpackImportWizard } from "./ModpackImportWizard";

function renderInLocale(ui: ReactNode, locale: "en" | "ja") {
  localStorage.setItem("server-hub:language:v1", locale);
  return render(<I18nProvider>{ui}</I18nProvider>);
}

const renderJapanese = (ui: ReactNode) => renderInLocale(ui, "ja");

const server = {
  id: "m4-wizard",
  name: "M4 Wizard",
  rootPath: "C:\\Servers\\M4-Wizard",
  gameKind: "minecraft" as const,
  serverType: "fabric" as const,
  minecraftVersion: "1.20.1",
  distributionBuild: "0.15.0",
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
  target: { game: "minecraft-java", minecraftVersion: "1.20.1", loader: "fabric", loaderVersion: "0.15.0", javaMajor: 17 },
  desiredSets: { server: [], client: [], optionalClient: [] },
  roleOverrides: [],
  artifacts: [],
  lastSuccessfulLaunch: null,
  updatedAt: "test",
};

const acquisition = { method: "local-file", source: "mods/example.jar", requiresNetwork: false };
const plan: ModpackPlan = {
  schemaVersion: 1,
  sourceKind: "curseforge-export",
  sourceName: "fixture-pack",
  target: state.target,
  artifacts: [
    {
      artifactId: "sha256:server",
      fileName: "server.jar",
      sourceRelativePath: "overrides/mods/server.jar",
      sizeBytes: 128,
      sha256: "server",
      role: "server-only",
      roleEvidence: ["strong:fabric-environment-server"],
      provider: "local",
      acquisition,
      redistributable: true,
      stageEligible: true,
      unresolved: false,
      dependencies: [],
    },
    {
      artifactId: "source:mystery.jar",
      fileName: "mystery.jar",
      sourceRelativePath: "overrides/mods/mystery.jar",
      sizeBytes: 64,
      role: "unknown",
      roleEvidence: ["weak:role-unresolved"],
      provider: "local",
      acquisition,
      redistributable: true,
      stageEligible: false,
      unresolved: false,
      dependencies: [],
    },
  ],
  unresolvedDependencies: [],
  overrides: [],
  configFiles: [],
  redistribution: [
    { subject: "server.jar", provider: "local", allowed: true, reason: "local", acquisition },
    { subject: "mystery.jar", provider: "local", allowed: true, reason: "local", acquisition },
  ],
  existingServerApply: { enabled: false, reason: "M4では未実装" },
  safety: { readOnlyAnalysis: true, archiveLimitsChecked: true, unknownPlacementBlocked: true, sourceUnchanged: true, networkUsed: false },
  planFingerprint: "fixture-fingerprint",
};

describe("ModpackImportWizard", () => {
  it("shows all five stages, keeps existing-server apply disabled, and blocks create on confirmation mismatch", async () => {
    const analyze = vi.spyOn(backend, "analyzeModpackSource").mockResolvedValue(plan);
    const create = vi.spyOn(backend, "createModpackConfiguration").mockResolvedValue({
      planFingerprint: plan.planFingerprint,
      stagedArtifacts: 1,
      excludedArtifacts: 1,
      stateCreated: true,
      destinationName: "fixture-pack",
    });

    renderJapanese(<ModpackImportWizard server={server} state={state} onClose={vi.fn()} notify={vi.fn()} fail={vi.fn()} />);

    const steps = screen.getByRole("navigation", { name: "Modパック取込の手順" });
    expect(steps).toHaveTextContent("入力");
    expect(steps).toHaveTextContent("対象");
    expect(steps).toHaveTextContent("分類");
    expect(steps).toHaveTextContent("未解決／配布");
    expect(steps).toHaveTextContent("作成計画");

    fireEvent.click(screen.getByRole("button", { name: "Modパックファイルを選択" }));
    await waitFor(() => expect(analyze).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.getByText("未確認は作成先へ配置しません")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(screen.getByRole("button", { name: "既存サーバーへ適用（M4未実装）" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "選択" }));
    await waitFor(() => expect(screen.getByPlaceholderText("フォルダーを選択してください")).toHaveValue("C:\\Servers\\fixture-pack"));

    const confirmation = screen.getByPlaceholderText(`CREATE MODPACK ${plan.planFingerprint}`);
    fireEvent.change(confirmation, { target: { value: "CREATE MODPACK wrong-fingerprint" } });
    const createButton = screen.getByRole("button", { name: "新規構成を作成" });
    expect(createButton).toBeDisabled();
    fireEvent.click(createButton);
    expect(create).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it("renders the M4 read-only setup safety guidance in English", () => {
    renderInLocale(<ModpackImportWizard server={server} state={state} onClose={vi.fn()} notify={vi.fn()} fail={vi.fn()} />, "en");
    expect(screen.getByRole("heading", { name: "Create a new setup from a Modpack" })).toBeInTheDocument();
    expect(screen.getByText("The input is analyzed read-only. Only verified local JARs are copied to a new empty folder.")).toBeInTheDocument();
  });
});
