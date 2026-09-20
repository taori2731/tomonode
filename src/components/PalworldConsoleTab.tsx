import { ConsoleTab } from "./ConsoleTab";
import { useI18n } from "../lib/i18n";
import { palworldText } from "../lib/palworldLocale";
import type { LogEntry } from "../types";

export function PalworldConsoleTab({
  logs,
  running,
  onClear,
  onCopy,
  onSave,
}: {
  logs: LogEntry[];
  running: boolean;
  onClear: () => void;
  onCopy: (text: string) => void;
  onSave: () => void;
}) {
  const { locale } = useI18n();
  return <ConsoleTab
    logs={logs}
    running={running}
    commandsEnabled={false}
    commandUnavailableMessage={palworldText(locale, "readOnlyLogs")}
    onClear={onClear}
    onCopy={onCopy}
    onSave={onSave}
    onCommand={async () => undefined}
  />;
}
