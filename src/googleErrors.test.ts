import { describe, it, expect } from "vitest";
import { googleApiError } from "./googleErrors";
const url = "https://sheets.googleapis.com/v4/spreadsheets";
describe("Google API エラーの案内", () => {
  it("新形式の SERVICE_DISABLED をAPI有効化の案内にする", () => {
    const payload = {
      error: {
        message: "raw details",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            reason: "SERVICE_DISABLED",
            metadata: { service: "sheets.googleapis.com" },
          },
        ],
      },
    };
    expect(googleApiError(url, 403, payload)).toContain(
      "Google Sheets API が有効になっていないか",
    );
  });
  it("旧形式の accessNotConfigured も認識する", () => {
    expect(
      googleApiError(url, 403, {
        error: { errors: [{ reason: "accessNotConfigured" }] },
      }),
    ).toContain("SERVICE_DISABLED");
  });
  it("権限不足をAPI未有効と混同しない", () => {
    const message = googleApiError(url, 403, {
      error: { details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] },
    });
    expect(message).toContain("Google に再接続");
    expect(message).not.toContain("SERVICE_DISABLED");
  });
  it("回数制限と組織の制限を区別する", () => {
    expect(
      googleApiError(url, 403, {
        error: { errors: [{ reason: "userRateLimitExceeded" }] },
      }),
    ).toContain("RATE_LIMIT");
    expect(
      googleApiError(url, 403, {
        error: { errors: [{ reason: "domainPolicy" }] },
      }),
    ).toContain("ACCOUNT_POLICY");
  });
  it("原因不明の403やJSON以外でも安全な案内を返し、生の値を表示しない", () => {
    for (const payload of [
      undefined,
      "Forbidden",
      {
        error: {
          message: "access_token=private-value sheet-id=private-sheet",
          details: [{ reason: "unknown-private-value" }],
        },
      },
    ]) {
      const message = googleApiError(url, 403, payload);
      expect(message).toContain("アクセスを拒否");
      expect(message).not.toContain("private-value");
      expect(message).not.toContain("private-sheet");
    }
  });
  it("Drive エラーをSheetsの障害と表示しない", () => {
    expect(
      googleApiError("https://www.googleapis.com/drive/v3/files", 500, {}),
    ).toContain("Google Drive API");
  });
});
