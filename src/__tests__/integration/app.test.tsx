import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../app";
import { db } from "../../db";
import type { Note } from "../../data";

const NOTE_A: Note = {
  path: "note-a.md",
  body: "# Note A\n\nContent of note A.",
  created: "2024-01-01",
  updated: "2024-01-01",
};

const NOTE_B: Note = {
  path: "note-b.md",
  body: "# Note B\n\nContent of note B.",
  created: "2024-01-01",
  updated: "2024-01-01",
};

beforeEach(async () => {
  await db.notes.clear();
  await db.settings.clear();
});

describe("ノートを選択すると本文が表示される", () => {
  it("サイドバーのノートをクリックすると本文が表示される", async () => {
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await screen.findByText("note-a");
    await userEvent.click(screen.getByText("note-b"));

    await screen.findByText("Content of note B.");
  });
});

describe("編集モード → 保存 → 閲覧モードに戻る", () => {
  it("保存ボタンで変更が保存されて閲覧モードに戻る", async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText("note-a");
    await userEvent.click(screen.getAllByText("note-a")[0]);
    await screen.findByText("Content of note A.");

    await userEvent.click(screen.getByTitle("編集 (E)"));
    const textarea = screen.getByRole("textbox");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "# Note A\n\nUpdated content.");

    await userEvent.click(screen.getByText(/保存/));

    await screen.findByText("Updated content.");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("編集モード → ESC → 変更が破棄される", () => {
  it("ESC キーでドラフトが破棄されて閲覧モードに戻る", async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText("note-a");
    await userEvent.click(screen.getAllByText("note-a")[0]);
    await screen.findByText("Content of note A.");

    await userEvent.click(screen.getByTitle("編集 (E)"));
    const textarea = screen.getByRole("textbox");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "# Discarded changes");

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(screen.queryByText("Discarded changes")).toBeNull();
  });
});

describe("新規ノートダイアログからノートを作成できる", () => {
  it("+ ボタンでダイアログが開き、パスを入力してノートを作成できる", async () => {
    render(<App />);

    await userEvent.click(screen.getByLabelText("新規ノート"));

    const input = screen.getByPlaceholderText("ideas/new-idea.md");
    await userEvent.type(input, "test-note.md");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("ideas/new-idea.md")).toBeNull();
    });

    const saved = await db.notes.get("test-note.md");
    expect(saved).toBeDefined();
    expect(saved?.path).toBe("test-note.md");

    await screen.findByRole("textbox");
  });
});

describe("編集中に別ノートへ移動したとき変更が破棄される", () => {
  it("編集中に別ノートをクリックすると編集モードが終了する", async () => {
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await screen.findByText("note-a");
    await userEvent.click(screen.getAllByText("note-a")[0]);
    await screen.findByText("Content of note A.");

    await userEvent.click(screen.getByTitle("編集 (E)"));
    expect(screen.getByRole("textbox")).toBeDefined();

    await userEvent.click(screen.getByText("note-b"));

    await waitFor(() => {
      expect(screen.queryByRole("textbox")).toBeNull();
    });
    await screen.findByText("Content of note B.");
  });
});
