import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "./model";
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("VITE_ALLOWED_EMAIL", "owner@example.test");
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) || null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
  vi.stubGlobal("window", {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (options: any) => ({
            requestAccessToken: () =>
              options.callback({
                access_token: "test-token",
                expires_in: 3600,
              }),
          }),
          revoke: vi.fn(),
        },
      },
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("外部サービス連携（通信モック）", () => {
  it("openBD の接続失敗時は Google Books に切り替える", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(Error("network"))
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              volumeInfo: {
                title: "算数の授業",
                authors: ["著者"],
                categories: ["Education"],
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const { searchBooks } = await import("./services");
    const result = await searchBooks("9784003101018");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result[0].subgenre).toBe("授業づくり・学習評価");
  });
  it("シートの古い一節を消し、新しい記録を数式ではなく文字列として一括更新する", async () => {
    const fetcher = vi.fn(async (url: string, options: any = {}) => {
      if (url.includes("userinfo"))
        return Response.json({ email: "owner@example.test" });
      if (url.endsWith("/spreadsheets") && options.method === "POST")
        return Response.json({ spreadsheetId: "sheet1" });
      if (url.includes("?fields=sheets.properties"))
        return Response.json({
          sheets: ["読書記録", "好きな一節", "授業で試したいこと"].map(
            (title, sheetId) => ({
              properties: {
                title,
                sheetId,
                gridProperties: { rowCount: 100, columnCount: 26 },
              },
            }),
          ),
        });
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetcher);
    const { connectGoogle, syncSheets } = await import("./services");
    await connectGoogle();
    await syncSheets([makeBook({ title: "=1+1", quotes: [] })]);
    const call = fetcher.mock.calls.find(([url]) =>
      url.endsWith(":batchUpdate"),
    )!;
    const body = JSON.parse(call[1].body);
    expect(body.requests.filter((r: any) => r.updateCells?.range)).toHaveLength(
      3,
    );
    const titleCell = body.requests[2].updateCells.rows[1].values[1];
    expect(titleCell).toEqual({ userEnteredValue: { stringValue: "=1+1" } });
  });
  it("所有者以外のアカウントは接続を拒否し、トークンを失効させる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ email: "other@example.test" })),
    );
    const { connectGoogle, connected } = await import("./services");
    await expect(connectGoogle()).rejects.toThrow("利用対象");
    expect(connected()).toBe(false);
    expect(window.google.accounts.oauth2.revoke).toHaveBeenCalled();
  });
});

describe("ブラウザ内の Google 接続設定", () => {
  it("クライアントシークレットを受け付けず、IDとメールだけを保存する", async () => {
    const service = await import("./services");
    expect(() =>
      service.configureGoogle({
        clientId: "GOCSPX-not-a-client-id",
        allowedEmail: "",
      }),
    ).toThrow("クライアントID");
    service.configureGoogle({
      clientId: "123456789-browser-test.apps.googleusercontent.com",
      allowedEmail: "Owner@Example.test",
    });
    const config = JSON.parse(
      localStorage.getItem("dokushoroku-google-config-v1")!,
    );
    expect(config).toEqual({
      clientId: "123456789-browser-test.apps.googleusercontent.com",
      allowedEmail: "owner@example.test",
    });
    expect(JSON.stringify(config)).not.toContain("test-token");
  });
});

describe("Sheets が拒否した場合の詳細表示", () => {
  it("HTTP403の本文を調べ、再接続の要求ではなくAPI有効化を案内する", async () => {
    localStorage.setItem(
      "dokushoroku-v1",
      JSON.stringify({ books: [{ title: "保存済みの本" }] }),
    );
    const before = localStorage.getItem("dokushoroku-v1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("userinfo")
          ? Response.json({ email: "owner@example.test" })
          : Response.json(
              {
                error: { code: 403, details: [{ reason: "SERVICE_DISABLED" }] },
              },
              { status: 403 },
            ),
      ),
    );
    const { connectGoogle, syncSheets } = await import("./services");
    await connectGoogle();
    await expect(
      syncSheets([makeBook({ title: "保存済みの本" })]),
    ).rejects.toThrow("Google Sheets API が有効になっていないか");
    expect(localStorage.getItem("dokushoroku-v1")).toBe(before);
  });
});
