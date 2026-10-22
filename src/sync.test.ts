import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeBook, State, parseState } from "./model";
import { syncLibrary } from "./sync";
import { readCloud, syncSheets, writeCloud } from "./services";
vi.mock("./services", () => ({
  readCloud: vi.fn(),
  syncSheets: vi.fn(),
  writeCloud: vi.fn(),
}));
const state = (books: State["books"], dirty = false): State => ({
  books,
  shelves: ["授業づくり"],
  lastSync: "",
  dirty,
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(syncSheets).mockResolvedValue("sheet");
  vi.mocked(writeCloud).mockResolvedValue(undefined);
});
describe("端末間の読書記録共有", () => {
  it("初回接続で端末の記録をアップロードし、新しい端末から読める", async () => {
    const pc = state([makeBook({ title: "PCで登録した本" })], true);
    vi.mocked(readCloud).mockResolvedValueOnce(null);
    const first = await syncLibrary(pc);
    expect(writeCloud).toHaveBeenCalledWith(
      expect.objectContaining({ books: pc.books }),
    );
    vi.mocked(readCloud).mockResolvedValueOnce(first.state);
    vi.mocked(writeCloud).mockClear();
    const phone = await syncLibrary(state([]));
    expect(phone.state.books[0].title).toBe("PCで登録した本");
    expect(writeCloud).not.toHaveBeenCalled();
  });
  it("別の端末で追加した本と感想を、端末側の記録を消さずにまとめる", async () => {
    const original = makeBook({
      id: "shared",
      title: "同じ本",
      notes: "古い感想",
      updated: "2026-10-01T00:00:00Z",
    });
    const newer = {
      ...original,
      notes: "スマホで書いた感想",
      updated: "2026-10-02T00:00:00Z",
    };
    const localOnly = makeBook({ id: "local", title: "PCだけの本" });
    const remoteOnly = makeBook({ id: "remote", title: "スマホだけの本" });
    vi.mocked(readCloud).mockResolvedValue(state([newer, remoteOnly]));
    const result = await syncLibrary(state([original, localOnly], true));
    expect(result.state.books).toHaveLength(3);
    expect(result.state.books.find((b) => b.id === "shared")?.notes).toBe(
      "スマホで書いた感想",
    );
    expect(original.notes).toBe("古い感想");
  });
  it("スプレッドシート失敗時にも本棚を共有し、転記待ちを残す", async () => {
    vi.mocked(readCloud).mockResolvedValue(null);
    vi.mocked(syncSheets).mockRejectedValue(Error("Sheets unavailable"));
    const result = await syncLibrary(
      state([makeBook({ title: "消さない本" })], true),
    );
    expect(writeCloud).toHaveBeenCalled();
    expect(result.state.dirty).toBe(true);
    expect(result.sheetError).toBe("Sheets unavailable");
  });
  it("Drive への書き込み失敗は成功扱いせず、元の記録を変更しない", async () => {
    const local = state([makeBook({ title: "保護する本" })], true);
    const original = JSON.stringify(local);
    vi.mocked(readCloud).mockResolvedValue(null);
    vi.mocked(writeCloud).mockRejectedValue(Error("Drive unavailable"));
    await expect(syncLibrary(local)).rejects.toThrow("Drive unavailable");
    expect(JSON.stringify(local)).toBe(original);
  });
  it("破損した共有データ・バックアップの読み込みを拒否する", () => {
    const b = makeBook({ title: "本" });
    expect(() => parseState(state([{ ...b, quotes: null } as any]))).toThrow(
      "中断",
    );
    expect(() => parseState(state([b, b]))).toThrow("中断");
    expect(() => parseState({ books: [], shelves: "invalid" })).toThrow("中断");
    expect(parseState(state([b])).books[0].id).toBe(b.id);
  });
});
