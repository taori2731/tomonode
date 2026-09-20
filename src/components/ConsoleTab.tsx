import { useDeferredValue, useMemo, useState } from "react";
import type { LogEntry } from "../types";
import { Icon } from "./Icon";

interface Props {
  logs: LogEntry[];
  running: boolean;
  onClear: () => void;
  onCopy: (text: string) => void;
  onSave: () => void;
  onCommand: (value: string) => Promise<void>;
  commandsEnabled?: boolean;
  commandUnavailableMessage?: string;
}

export const CONSOLE_DISPLAY_LIMIT = 500;

export function ConsoleTab({ logs, running, onClear, onCopy, onSave, onCommand, commandsEnabled = true, commandUnavailableMessage }: Props) {
  const [query, setQuery] = useState("");
  const [command, setCommand] = useState("");
  const deferredQuery = useDeferredValue(query.toLowerCase());
  const matchingLogs = useMemo(() => logs.filter((entry) => `${entry.level} ${entry.message}`.toLowerCase().includes(deferredQuery)), [logs, deferredQuery]);
  const visibleLogs = useMemo(() => matchingLogs.slice(-CONSOLE_DISPLAY_LIMIT), [matchingLogs]);
  const hiddenLogCount = matchingLogs.length - visibleLogs.length;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    await onCommand(value);
    setCommand("");
  };

  const copyVisibleLogs = () => {
    const text = visibleLogs.map((entry) => `[${entry.timestamp}] [${entry.level}] ${entry.message}`).join("\n");
    onCopy(text);
  };
  return (
    <div className="tab-content console-content">
      <section className="console-panel">
        <header className="console-toolbar">
          <label className="search-field"><Icon name="search" size={18} /><span className="sr-only">ログを検索</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ログを検索" /></label>
          <span className="result-count">{matchingLogs.length} 件</span>
          <button className="small-button" type="button" onClick={copyVisibleLogs}><Icon name="clipboard" size={17} />コピー</button>
          <button className="small-button" type="button" onClick={onSave}><Icon name="download" size={17} />保存</button>
          <button className="small-button" type="button" onClick={onClear}><Icon name="trash" size={17} />クリア</button>
        </header>
        {hiddenLogCount > 0 ? <p className="console-limit-note" role="note">表示は最新{CONSOLE_DISPLAY_LIMIT}件まで（検索結果{matchingLogs.length}件中）。コピーも表示中の範囲です。</p> : null}
        <div className="console-log" role="log" aria-live="polite">
          {visibleLogs.map((entry, index) => <div data-no-translate key={`${entry.timestamp}-${index}`}><time>[{entry.timestamp}]</time><b className={entry.level.toLowerCase()}>[{entry.level}]</b><span>{entry.message}</span></div>)}
          {visibleLogs.length === 0 ? <p className="empty-log">一致するログはありません。</p> : null}
        </div>
        {commandsEnabled ? <form className="command-line" onSubmit={submit}>
          <span aria-hidden="true">›</span>
          <input aria-label="サーバーコマンド" value={command} onChange={(event) => setCommand(event.target.value)} disabled={!running} placeholder={running ? "コマンドを入力（例: list）" : "サーバーを起動するとコマンドを送信できます"} />
          <button className="primary-button" type="submit" disabled={!running || command.trim().length === 0}>送信</button>
        </form> : <div className="console-command-unavailable" role="note"><Icon name="info" size={17} />{commandUnavailableMessage ?? "This server exposes logs as read-only."}</div>}
      </section>
    </div>
  );
}
