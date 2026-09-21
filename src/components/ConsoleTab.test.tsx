import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LogEntry } from "../types";
import { ConsoleTab } from "./ConsoleTab";

function logEntries(count: number): LogEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: `12:00:${String(index % 60).padStart(2, "0")}`,
    level: index % 10 === 0 ? "WARN" : "INFO",
    message: `line-${index}`,
  }));
}

describe("console log performance safeguards", () => {
  it("renders and copies the complete matching log history without an artificial line limit", () => {
    const onCopy = vi.fn();
    const logs = logEntries(700);
    render(<ConsoleTab logs={logs} running onClear={vi.fn()} onCopy={onCopy} onSave={vi.fn()} onCommand={vi.fn().mockResolvedValue(undefined)} />);

    expect(screen.getByRole("log").querySelectorAll(":scope > div")).toHaveLength(logs.length);
    expect(screen.getByRole("log")).toHaveTextContent("line-0");
    expect(screen.getByRole("log")).toHaveTextContent("line-699");
    expect(onCopy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "コピー" }));

    expect(onCopy).toHaveBeenCalledTimes(1);
    const copied = onCopy.mock.calls[0][0] as string;
    expect(copied.split("\n")).toHaveLength(logs.length);
    expect(copied).toContain("line-699");
    expect(copied).toContain("line-0");
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

  it("keeps an unchanged visible row mounted when a new log arrives", () => {
    const { rerender } = render(<ConsoleTab logs={logEntries(500)} running onClear={vi.fn()} onCopy={vi.fn()} onSave={vi.fn()} onCommand={vi.fn().mockResolvedValue(undefined)} />);
    const stableRow = screen.getByText("line-499").parentElement;

    rerender(<ConsoleTab logs={[...logEntries(500), { timestamp: "12:01:00", level: "INFO", message: "line-500" }]} running onClear={vi.fn()} onCopy={vi.fn()} onSave={vi.fn()} onCommand={vi.fn().mockResolvedValue(undefined)} />);

    expect(screen.getByText("line-499").parentElement).toBe(stableRow);
  });

  it.each([1_000, 5_000])("keeps all %s incoming log entries available to the console", (count) => {
    const { unmount } = render(<ConsoleTab logs={logEntries(count)} running onClear={vi.fn()} onCopy={vi.fn()} onSave={vi.fn()} onCommand={vi.fn().mockResolvedValue(undefined)} />);

    expect(screen.getByRole("log").querySelectorAll(":scope > div")).toHaveLength(count);
    expect(screen.getByRole("log")).toHaveTextContent("line-0");
    expect(screen.getByRole("log")).toHaveTextContent(`line-${count - 1}`);
    unmount();
  });
});
