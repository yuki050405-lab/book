import {
  Book,
  State,
  makeBook,
  classify,
  rowsForSheets,
  parseState,
} from "./model";
export async function searchBooks(query: string): Promise<Book[]> {
  const isbn = query.replace(/[-\s]/g, "");
  const isCode = /^\d{9}[\dXx]$|^\d{13}$/.test(isbn);
  if (isCode) {
    try {
      const response = await fetch(
        `https://api.openbd.jp/v1/get?isbn=${encodeURIComponent(isbn)}`,
      );
      if (response.ok) {
        const data = await response.json();
        const item = data?.[0];
        if (item?.summary) {
          const s = item.summary;
          const desc =
            item.onix?.CollateralDetail?.TextContent?.find(
              (x: any) => x.TextType === "03",
            )?.Text || "";
          return [
            makeBook({
              title: s.title,
              author: s.author,
              isbn: s.isbn,
              cover: s.cover || "",
              description: desc,
              ...classify(s.title + " " + desc),
            }),
          ];
        }
      }
    } catch {
      /* Fall back to Google Books if openBD cannot be reached. */
    }
  }
  const response = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(isCode ? "isbn:" + isbn : query)}&maxResults=12&langRestrict=ja`,
  );
  if (!response.ok)
    throw Error(
      response.status === 429
        ? "書籍検索が混み合っています。時間をおくか、手動で登録してください。"
        : "書籍検索に接続できません。手動でも登録できます。",
    );
  const data = await response.json();
  return (data.items || []).map((item: any) => {
    const v = item.volumeInfo;
    const description = (v.description || "").replace(/<[^>]*>/g, "");
    return makeBook({
      title: v.title || "",
      author: (v.authors || []).join("、"),
      isbn:
        v.industryIdentifiers?.find((x: any) => x.type === "ISBN_13")
          ?.identifier || "",
      cover: (v.imageLinks?.thumbnail || "").replace(/^http:/, "https:"),
      description,
      ...classify([v.title, description, ...(v.categories || [])].join(" ")),
    });
  });
}
declare global {
  interface Window {
    google: any;
  }
}
let token = "";
let expiry = 0;
const CONFIG_KEY = "dokushoroku-google-config-v1";
function savedConfig(): { clientId?: string; allowedEmail?: string } {
  try {
    const data = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
    return data && typeof data === "object"
      ? {
          clientId: typeof data.clientId === "string" ? data.clientId : "",
          allowedEmail:
            typeof data.allowedEmail === "string" ? data.allowedEmail : "",
        }
      : {};
  } catch {
    return {};
  }
}
const config = savedConfig();
export let clientId =
  config.clientId || import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
export let allowedEmail =
  config.allowedEmail || import.meta.env.VITE_ALLOWED_EMAIL || "";
export function configureGoogle(next: {
  clientId: string;
  allowedEmail: string;
}) {
  const id = next.clientId.trim();
  const email = next.allowedEmail.trim().toLowerCase();
  if (!/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(id))
    throw Error(
      "OAuth クライアントIDを確認してください。パスワードやクライアントシークレットは入力しないでください。",
    );
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw Error("メールアドレスを確認してください。");
  localStorage.setItem(
    CONFIG_KEY,
    JSON.stringify({ clientId: id, allowedEmail: email }),
  );
  disconnectGoogle();
  clientId = id;
  allowedEmail = email;
}
let gisLoading: Promise<void> | undefined;
export async function prepareGoogle() {
  if (window.google?.accounts) return;
  if (!gisLoading)
    gisLoading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      const timeout = setTimeout(() => {
        script.remove();
        gisLoading = undefined;
        reject(
          Error("Google に接続できません。通信を確認して再試行してください。"),
        );
      }, 15000);
      script.src = "https://accounts.google.com/gsi/client";
      script.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timeout);
        script.remove();
        gisLoading = undefined;
        reject(Error("Google ログインを読み込めません。"));
      };
      document.head.appendChild(script);
    });
  return gisLoading;
}
export async function connectGoogle(): Promise<string> {
  if (!clientId)
    throw Error(
      "Google 連携は未設定です。「はじめての接続設定」を開いてください。",
    );
  await prepareGoogle();
  return new Promise((resolve, reject) => {
    window.google.accounts.oauth2
      .initTokenClient({
        client_id: clientId,
        scope:
          "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email",
        callback: async (r: any) => {
          try {
            if (r.error) throw Error("Google の認証が完了しませんでした。");
            if (!r.access_token)
              throw Error("Google の認証が完了しませんでした。");
            token = r.access_token;
            expiry = Date.now() + Number(r.expires_in || 3600) * 1000;
            const user = await api(
              "https://www.googleapis.com/oauth2/v3/userinfo",
            );
            if (
              !user.email ||
              (allowedEmail &&
                user.email.toLowerCase() !== allowedEmail.toLowerCase())
            ) {
              disconnectGoogle();
              throw Error("この Google アカウントは利用対象ではありません。");
            }
            const previous = localStorage.getItem("dokushoroku-google-account");
            if (previous && previous !== user.email) {
              cloudFile = "";
              localStorage.removeItem("dokushoroku-sheet");
            }
            localStorage.setItem("dokushoroku-google-account", user.email);
            resolve(user.email);
          } catch (e) {
            disconnectGoogle();
            reject(e);
          }
        },
        error_callback: () => reject(Error("ログインがキャンセルされました。")),
      })
      .requestAccessToken();
  });
}
export function disconnectGoogle() {
  cloudFile = "";
  localStorage.removeItem("dokushoroku-sheet");
  if (token && window.google?.accounts)
    window.google.accounts.oauth2.revoke(token);
  token = "";
  expiry = 0;
}
export function connected() {
  return Boolean(token) && Date.now() < expiry;
}
async function api(url: string, options: RequestInit = {}) {
  if (!connected()) throw Error("Google に接続し直してください。");
  const r = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (r.status === 401) {
    token = "";
    expiry = 0;
    throw Error(
      "Google の接続期限が切れました。再接続してください。端末内の記録は残っています。",
    );
  }
  if (!r.ok)
    throw Error(
      `Google 連携に失敗しました（${r.status}）。本は端末に保存されています。`,
    );
  return r.json();
}
let cloudFile = "";
export async function readCloud(): Promise<State | null> {
  const files = await api(
    "https://www.googleapis.com/drive/v3/files?q=" +
      encodeURIComponent(
        "trashed = false and appProperties has { key='app' and value='dokushoroku-v1' }",
      ) +
      "&fields=files(id,modifiedTime)&orderBy=modifiedTime%20desc",
  );
  cloudFile = files.files?.[0]?.id || "";
  if (!cloudFile) return null;
  const data = await api(
    `https://www.googleapis.com/drive/v3/files/${cloudFile}?alt=media`,
  );
  const state = parseState(data);
  if (data.sheetId) {
    if (typeof data.sheetId !== "string" || !/^[-\w]+$/.test(data.sheetId))
      throw Error("スプレッドシートの保存先が不正です。同期を中断しました。");
    localStorage.setItem("dokushoroku-sheet", data.sheetId);
  }
  return state;
}
export async function writeCloud(state: State) {
  if (!cloudFile) {
    const f = await api("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      body: JSON.stringify({
        name: "読書録-data.json",
        mimeType: "application/json",
        appProperties: { app: "dokushoroku-v1" },
      }),
    });
    cloudFile = f.id;
  }
  await api(
    `https://www.googleapis.com/upload/drive/v3/files/${cloudFile}?uploadType=media`,
    {
      method: "PATCH",
      body: JSON.stringify({
        ...state,
        dirty: false,
        sheetId: localStorage.getItem("dokushoroku-sheet") || "",
      }),
    },
  );
}
export async function syncSheets(books: Book[]): Promise<string> {
  let id = localStorage.getItem("dokushoroku-sheet") || "";
  if (!id) {
    const sheet = await api("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      body: JSON.stringify({
        properties: { title: "読書録 — 私の書斎" },
        sheets: ["読書記録", "好きな一節", "授業で試したいこと"].map(
          (title) => ({ properties: { title } }),
        ),
      }),
    });
    id = sheet.spreadsheetId;
    localStorage.setItem("dokushoroku-sheet", id);
  }
  const sheet = await api(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties`,
  );
  const rows = rowsForSheets(books);
  const titles = ["読書記録", "好きな一節", "授業で試したいこと"];
  const datasets = [rows.books, rows.quotes, rows.actions];
  const requests = titles.flatMap((title, i) => {
    const properties = sheet.sheets.find(
      (s: any) => s.properties.title === title,
    )?.properties;
    if (!properties)
      throw Error(
        "専用シートのタブが見つかりません。タブ名を元に戻してください。",
      );
    const sheetId = properties.sheetId;
    const values = datasets[i];
    return [
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: {
              rowCount: Math.max(
                properties.gridProperties.rowCount,
                values.length + 1,
              ),
              columnCount: Math.max(
                properties.gridProperties.columnCount,
                values[0].length,
              ),
            },
          },
          fields: "gridProperties.rowCount,gridProperties.columnCount",
        },
      },
      { updateCells: { range: { sheetId }, fields: "userEnteredValue" } },
      {
        updateCells: {
          start: { sheetId, rowIndex: 0, columnIndex: 0 },
          rows: values.map((row) => ({
            values: row.map((value) => ({
              userEnteredValue: { stringValue: String(value) },
            })),
          })),
          fields: "userEnteredValue",
        },
      },
    ];
  });
  await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
  return id;
}
