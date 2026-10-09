import { describe, expect, it } from "vitest";
import packageManifest from "../../package.json";
import packageLock from "../../package-lock.json";
import cargoManifest from "../../src-tauri/Cargo.toml?raw";
import cargoLock from "../../src-tauri/Cargo.lock?raw";
import tauriConfig from "../../src-tauri/tauri.conf.json";
import { backend } from "./backend";
import releaseWorkflow from "../../.github/workflows/sign-windows-release.yml?raw";
import nativeUpdater from "../../src-tauri/src/app_update.rs?raw";
import { supportConfig } from "./supporterConfig";
import { languageOptions, type AppLocale } from "./i18n";
import { releaseAnnouncements } from "./releaseNews";
import releaseNotes from "../../docs/releases/0.5.18.md?raw";

const releaseVersion = "0.5.18";

describe("release version alignment", () => {
  it.each(languageOptions.filter(option => option.value !== "system"))("publishes current update news for $value", ({ value }) => {
    const current = releaseAnnouncements(value as AppLocale)[0];
    expect(current.id).toBe(releaseVersion);
    expect(current.date).toBe("2026-10-10");
    expect(current.tag).toBe("FIX");
    expect(current.title).toContain(releaseVersion);
    expect(current.body.trim().length).toBeGreaterThan(40);
    expect(current.body).toContain("Stripe");
    expect(releaseAnnouncements(value as AppLocale)[1].id).toBe("0.5.17");
  });
  it("keeps app manifests and the browser demo on the same release candidate", async () => {
    const cargoManifestVersion = cargoManifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    const cargoLockVersion = cargoLock.match(/\[\[package\]\]\s*name = "minecraft-server-hub"\s*version = "([^"]+)"/s)?.[1];

    expect([
      packageManifest.version,
      packageLock.version,
      packageLock.packages[""].version,
      cargoManifestVersion,
      cargoLockVersion,
      tauriConfig.version,
    ]).toEqual([releaseVersion, releaseVersion, releaseVersion, releaseVersion, releaseVersion, releaseVersion]);
    expect(await backend.getAppVersion()).toBe(releaseVersion);
    expect((await backend.checkAppUpdate()).currentVersion).toBe(releaseVersion);
  });
  it("keeps the release guarded while enabling server-gated billing integration, not sale authority", () => {
    expect(releaseWorkflow).toContain(`if ($env:RELEASE_VERSION -ne "${releaseVersion}")`);
    expect(releaseWorkflow).toContain(`if ($env:RELEASE_TAG -ne "v${releaseVersion}")`);
    expect(releaseWorkflow).not.toContain("0.5.15");
    expect(releaseWorkflow).toContain('if ($env:GITHUB_REF -ne "refs/heads/main")');
    expect(releaseWorkflow).toContain("default: false");
    expect(releaseWorkflow).toContain("--draft");
    expect(releaseWorkflow).toContain("Refusing to overwrite an existing release");
    expect(releaseWorkflow).toContain("Refusing to reuse an existing git tag");
    expect(releaseWorkflow).toContain("if: ${{ inputs.publish }}");
    expect(supportConfig.enabled).toBe(true);
    expect(releaseNotes).toContain(`TomoNode ${releaseVersion}`);
    expect(releaseNotes).toContain("この更新だけでは販売を開始せず");
    expect(releaseWorkflow).toContain("Purchases still require explicit authenticated server checkout permission");
    expect(tauriConfig.identifier).toBe("local.minecraft-server-hub.desktop");
    expect(nativeUpdater.match(/const DEFAULT_UPDATE_ENDPOINT: &str =\s*"([^"]+)"/)?.[1]).toBe(
      "https://github.com/taori2731/tomonode-releases/releases/latest/download/latest.json",
    );
  });
});
