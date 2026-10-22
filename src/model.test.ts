import { describe, it, expect } from "vitest";
import {
  classify,
  isISBN,
  deduplicate,
  makeBook,
  rowsForSheets,
  mergeStates,
  State,
} from "./model";
describe("読書録のデータ処理", () => {
  it("ISBN-13 / ISBN-10 のチェックディジットを確認する", () => {
    expect(isISBN("978-4-00-310101-8")).toBe(true);
    expect(isISBN("4003101014")).toBe(true);
    expect(isISBN("9784003101019")).toBe(false);
    expect(isISBN("1920000000000")).toBe(false);
  });
  it("教育書を内容に応じて細分類する", () => {
    expect(classify("小学校の学級経営")).toEqual({
      genre: "教育",
      subgenre: "学級経営・生徒指導",
    });
    expect(classify("算数の授業づくり")).toEqual({
      genre: "教育",
      subgenre: "授業づくり・学習評価",
    });
    expect(classify("インクルーシブな授業")).toEqual({
      genre: "教育",
      subgenre: "特別支援・インクルーシブ教育",
    });
    expect(classify("教育の未来")).toEqual({
      genre: "教育",
      subgenre: "詳細未分類",
    });
    expect(classify("未知の本")).toEqual({ genre: "未分類", subgenre: "" });
  });
  it("ISBN のない電子書籍をタイトルと著者で重複検出する", () => {
    const a = makeBook({
      title: "授業 づくり",
      author: "山田",
      format: "電子書籍",
    });
    expect(
      deduplicate([a], makeBook({ title: "授業づくり", author: "山田" })),
    ).toBe(a);
    expect(
      deduplicate([a], makeBook({ title: "授業づくり", author: "別の著者" })),
    ).toBeUndefined();
  });
  it("一節・実践・教育分類を落とさずシート用データにする", () => {
    const b = makeBook({
      title: "教育の本",
      genre: "教育",
      subgenre: "学級経営・生徒指導",
      quotes: [{ id: "q", text: '=IMPORTXML("x")', location: "第2章" }],
      actions: [
        { id: "a", text: "朝の対話", status: "試した", reflection: "よかった" },
      ],
    });
    const rows = rowsForSheets([b]);
    expect(rows.books[1][6]).toBe("学級経営・生徒指導");
    expect(rows.quotes[1]).toEqual([
      b.id,
      b.title,
      "q",
      '=IMPORTXML("x")',
      "第2章",
    ]);
    expect(rows.actions[1][5]).toBe("よかった");
  });
  it("端末間の競合では更新日時が新しい記録を優先し、手動分類を保持する", () => {
    const old = makeBook({
      id: "same",
      title: "本",
      updated: "2026-01-01",
      genre: "教育",
      manualGenre: true,
    });
    const newer = { ...old, updated: "2026-02-01", notes: "新しい感想" };
    const state = (books: (typeof old)[]): State => ({
      books,
      shelves: [],
      lastSync: "",
      dirty: false,
    });
    expect(mergeStates(state([old]), state([newer])).books[0].notes).toBe(
      "新しい感想",
    );
    expect(mergeStates(state([newer]), state([old])).books[0].manualGenre).toBe(
      true,
    );
  });
});
