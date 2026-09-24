import { describe, expect, it } from "vitest";
import tauriConfig from "../../src-tauri/tauri.conf.json";
import englishInstallerMessages from "../../src-tauri/windows/languages/English.nsh?raw";
import installerHooks from "../../src-tauri/windows/installer-hooks.nsh?raw";
import installerTemplate from "../../src-tauri/windows/installer.nsi?raw";
import japaneseInstallerMessages from "../../src-tauri/windows/languages/Japanese.nsh?raw";

describe("Tauri native window branding compatibility", () => {
  it("keeps the display title separate from the installation identity", () => {
    expect(tauriConfig.app.windows[0].title).toBe("TomoNode");
    expect(tauriConfig.productName).toBe("Minecraft Server Hub");
    expect(tauriConfig.identifier).toBe("local.minecraft-server-hub.desktop");
  });

  it("uses the TomoNode Windows display name without changing the installation identity", () => {
    expect(tauriConfig.bundle.windows.nsis.installerHooks).toBe(
      "windows/installer-hooks.nsh",
    );
    expect(tauriConfig.bundle.windows.nsis.template).toBe(
      "windows/installer.nsi",
    );
    expect(tauriConfig.bundle.windows.nsis.customLanguageFiles).toEqual({
      Japanese: "windows/languages/Japanese.nsh",
      English: "windows/languages/English.nsh",
    });

    expect(installerHooks).toContain('!define TOMONODE_SHORTCUT_NAME "TomoNode"');
    expect(installerHooks).toContain('!define TOMONODE_DISPLAY_NAME "TomoNode"');
    expect(installerHooks).toContain("!macro NSIS_HOOK_POSTINSTALL");
    expect(installerHooks).toContain("!macro NSIS_HOOK_PREUNINSTALL");
    expect(installerHooks).toContain("IsShortcutTarget");
    expect(installerHooks).toContain("${PRODUCTNAME}.lnk");
    expect(installerHooks).toContain("${TOMONODE_SHORTCUT_NAME}.lnk");
    expect(installerHooks).toContain(
      'WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "${TOMONODE_DISPLAY_NAME}"',
    );
    expect(installerHooks).not.toContain("DeleteReg");
  });

  it("brands the installer and version information as TomoNode", () => {
    expect(installerTemplate).toContain('Name "${TOMONODE_DISPLAY_NAME}"');
    expect(installerTemplate).toContain(
      'BrandingText "${TOMONODE_DISPLAY_NAME}"',
    );
    expect(installerTemplate).toContain(
      'VIAddVersionKey "ProductName" "${TOMONODE_DISPLAY_NAME}"',
    );
    expect(installerTemplate).toContain(
      'VIAddVersionKey "FileDescription" "${TOMONODE_DISPLAY_NAME}"',
    );
    expect(installerTemplate).toContain(
      '"Open with ${TOMONODE_DISPLAY_NAME}"',
    );
    expect(installerTemplate).not.toContain('"Open with ${PRODUCTNAME}"');
    expect(installerTemplate).not.toContain("Minecraft Server Hub");
    expect(installerTemplate).toContain(
      '!define UNINSTKEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${PRODUCTNAME}"',
    );
    expect(installerTemplate).toContain(
      '!define PLACEHOLDER_INSTALL_DIR "placeholder\\${PRODUCTNAME}"',
    );

    const localizedMessages = `${japaneseInstallerMessages}\n${englishInstallerMessages}`;
    expect(localizedMessages).toContain("TomoNode");
    expect(localizedMessages).not.toContain("Minecraft Server Hub");
  });

  it("creates TomoNode shortcuts with the installed executable as their icon", () => {
    expect(installerTemplate).toContain(
      'CreateShortcut "$DESKTOP\\${TOMONODE_SHORTCUT_NAME}.lnk" "$INSTDIR\\${MAINBINARYNAME}.exe" "" "$INSTDIR\\${MAINBINARYNAME}.exe" 0',
    );
    expect(installerTemplate).toContain(
      'CreateShortcut "$SMPROGRAMS\\${TOMONODE_SHORTCUT_NAME}.lnk" "$INSTDIR\\${MAINBINARYNAME}.exe" "" "$INSTDIR\\${MAINBINARYNAME}.exe" 0',
    );
    expect(installerTemplate).not.toContain(
      'CreateShortcut "$DESKTOP\\${PRODUCTNAME}.lnk"',
    );
    expect(installerTemplate).toContain(
      '!insertmacro IsShortcutTarget "$DESKTOP\\${TOMONODE_SHORTCUT_NAME}.lnk" "$INSTDIR\\${MAINBINARYNAME}.exe"',
    );
    expect(installerHooks).toContain(
      '!insertmacro IsShortcutTarget "${OLD_PATH}" "$INSTDIR\\${MAINBINARYNAME}.exe"',
    );
  });

  it("uses the fixed dark icon for Windows app and installer chrome", () => {
    expect(tauriConfig.bundle.icon).toContain("icons/icon.png");
    expect(tauriConfig.bundle.icon).toContain("icons/tomonode-windows.ico");
    expect(tauriConfig.bundle.windows.nsis.installerIcon).toBe(
      "icons/tomonode-windows.ico",
    );
    expect(tauriConfig.bundle.windows.nsis.uninstallerIcon).toBe(
      "icons/tomonode-windows.ico",
    );
  });
});
