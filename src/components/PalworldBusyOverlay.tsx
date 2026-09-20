import { OperationOverlay } from "./OperationOverlay";
import { useI18n } from "../lib/i18n";
import { palworldText } from "../lib/palworldLocale";

export function PalworldBusyOverlay({ action }: { action: string }) {
  const { locale } = useI18n();
  const stopping = action === "stop";
  return <OperationOverlay
    title={palworldText(locale, stopping ? "safeShutdownSaving" : "statusStarting")}
    detail={palworldText(locale, stopping ? "safeShutdownDescription" : "phasePw1Description")}
    stages={stopping
      ? [palworldText(locale, "safeShutdownSaving"), palworldText(locale, "safeShutdownRequesting"), palworldText(locale, "safeShutdownWaiting")]
      : [palworldText(locale, "statusInstallingSteamCmd"), palworldText(locale, "statusPreparing"), palworldText(locale, "statusStarting")]}
  />;
}
