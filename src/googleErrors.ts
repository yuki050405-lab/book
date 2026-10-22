/** Convert Google's structured errors to guidance without exposing raw messages or file IDs. */
export function googleApiError(
  url: string,
  status: number,
  payload: unknown,
): string {
  const sheets = new URL(url).hostname === "sheets.googleapis.com";
  const service = sheets ? "Google Sheets API" : "Google Drive API";
  const root = object(payload);
  const error = object(root.error);
  const details = Array.isArray(error.details) ? error.details : [];
  const errors = Array.isArray(error.errors) ? error.errors : [];
  const reasons = [...details, ...errors]
    .map((item) => object(item).reason)
    .filter((reason): reason is string => typeof reason === "string");
  if (
    reasons.some((reason) =>
      ["SERVICE_DISABLED", "accessNotConfigured", "API_DISABLED"].includes(
        reason,
      ),
    )
  ) {
    return `${service} が有効になっていないか、有効化の反映待ちです。Google Cloud でログイン設定と同じプロジェクトの API を確認し、少し待って「今すぐ同期」を押してください。（${status} / SERVICE_DISABLED）`;
  }
  if (
    reasons.some((reason) =>
      ["ACCESS_TOKEN_SCOPE_INSUFFICIENT", "insufficientPermissions"].includes(
        reason,
      ),
    )
  ) {
    return `${service} の接続権限が不足しています。「Google に再接続」から、求められたファイルへのアクセスを確認してください。（${status} / SCOPE_INSUFFICIENT）`;
  }
  if (
    status === 429 ||
    reasons.some((reason) =>
      [
        "RATE_LIMIT_EXCEEDED",
        "QUOTA_EXCEEDED",
        "rateLimitExceeded",
        "userRateLimitExceeded",
        "quotaExceeded",
      ].includes(reason),
    )
  ) {
    return `${service} の利用回数の上限に達しました。時間をおいて再試行してください。端末の記録は残っています。（${status} / RATE_LIMIT）`;
  }
  if (
    reasons.some((reason) =>
      ["ORG_RESTRICTION_VIOLATION", "domainPolicy"].includes(reason),
    )
  ) {
    return `${service} が Google アカウントの組織設定で制限されています。学校・職場のアカウントの場合は管理者に確認してください。（${status} / ACCOUNT_POLICY）`;
  }
  if (status === 403) {
    return `${service} がアクセスを拒否しました。API の有効化、ログイン時の許可、保存先ファイルの編集権限を確認してください。（403）`;
  }
  return `${service} との通信に失敗しました（${status}）。端末の記録は残っています。`;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
