import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LogEntry } from "../types";
import { CONSOLE_DISPLAY_LIMIT, ConsoleTab } from "./ConsoleTab";

function logEntries(count: number): LogEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: `12:00:${String(index % 60).padStart(2, "0")}`,
    level: index % 10 === 0 ? "WARN" : "INFO",
    message: `line-${index}`,
  }));
}

describe("console log performance safeguards", () => {
  it("renders only the newest bounded log window and copies that visible window on demand", () => {
    const onCopy = vi.fn();
    const logs = logEntries(CONSOLE_DISPLAY_LIMIT + 200);
    render(<ConsoleTab logs={logs} running onClear={vi.fn()} onCopy={onCopy} onSave={vi.fn()} onCommand={vi.fn().mockResolvedValue(undefined)} />);

    expect(screen.getAllByRole("log")[0].querySelectorAll(":scope > div")).toHaveLength(CONSOLE_DISPLAY_LIMIT);
    expect(screen.getByRole("note")).toHaveTextContent(`表示は最新${CONSOLE_DISPLAY_LIMIT}件まで`);
    expect(screen.getByRole("log")).toHaveTextContent("line-699");
    expect(screen.getByRole("log")).not.toHaveTextContent("line-0");
    expect(onCopy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "コピー" }));

    expect(onCopy).toHaveBeenCalledTimes(1);
    const copied = onCopy.mock.calls[0][0] as string;
    expect(copied.split("\n")).toHaveLength(CONSOLE_DISPLAY_LIMIT);
    expect(copied).toContain("line-699");
    expect(copied).not.toContain("line-0");
  });

  it("keeps search, save, clear, and command actions available", () => {
    const onClear = vi.fn();
    const onSave = vi.fn();
    const onCommand = vi.fn().mockResolvedValue(undefined);
    render(<ConsoleTab logs={logEntries(2)} running onClear={onClear} onCopy={vi.fn()} onSave={onSave} onCommand={onCommand} />);

    fireEvent.change(screen.getByRole("textbox", { name: "ログを検索" }), { target: { value: "line-1" } });
    expect(screen.getByRole("log")).toHaveTextContent("line-1");
    expect(screen.getByRole("log")).not.toHaveTextContent("line-0");
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    fireEvent.click(screen.getByRole("button", { name: "クリア" }));
    fireEvent.change(screen.getByRole("textbox", { name: "サーバーコマンド" }), { target: { value: "list" } });
    fireEvent.click(screen.getByRole("button", { name: "送信" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenCalledWith("list");
  });
});
