import { test, expect, BrowserContext, chromium } from "@playwright/test";
const mockClient = "123456789-browser-test.apps.googleusercontent.com";
const owner = "owner@example.test";

test("PCの本棚を別ブラウザへ引き継ぎ、スマホの感想もPCへ戻す（Google通信モック）", async ({
  page,
  context,
  browser,
}, info) => {
  let cloud: any = null;
  let fileExists = false;
  let sheetFail = false;
  let pauseNextRead = false;
  let releaseRead: (() => void) | undefined;
  async function setup(ctx: BrowserContext, configured = false) {
    await ctx.addInitScript(
      ({ mockClient, owner, configured }) => {
        if (configured)
          localStorage.setItem(
            "dokushoroku-google-config-v1",
            JSON.stringify({ clientId: mockClient, allowedEmail: owner }),
          );
        (window as any).google = {
          accounts: {
            oauth2: {
              initTokenClient: (options: any) => ({
                requestAccessToken: () =>
                  options.callback({
                    access_token: "mock-access-token",
                    expires_in: 3600,
                  }),
              }),
              revoke: () => {},
            },
          },
        };
      },
      { mockClient, owner, configured },
    );
    await ctx.route("https://**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      if (
        url.hostname === "www.googleapis.com" &&
        url.pathname.includes("/userinfo")
      )
        return route.fulfill({ json: { email: owner } });
      if (
        url.hostname === "www.googleapis.com" &&
        url.pathname === "/drive/v3/files" &&
        method === "GET"
      )
        return route.fulfill({
          json: { files: fileExists ? [{ id: "library-file" }] : [] },
        });
      if (
        url.hostname === "www.googleapis.com" &&
        url.pathname === "/drive/v3/files" &&
        method === "POST"
      ) {
        fileExists = true;
        return route.fulfill({ json: { id: "library-file" } });
      }
      if (
        url.hostname === "www.googleapis.com" &&
        url.pathname === "/drive/v3/files/library-file"
      ) {
        const snapshot = cloud;
        if (pauseNextRead) {
          pauseNextRead = false;
          await new Promise<void>((resolve) => {
            releaseRead = resolve;
          });
        }
        return route.fulfill({ json: snapshot });
      }
      if (
        url.hostname === "www.googleapis.com" &&
        url.pathname === "/upload/drive/v3/files/library-file"
      ) {
        cloud = request.postDataJSON();
        return route.fulfill({ json: { id: "library-file" } });
      }
      if (url.hostname === "sheets.googleapis.com") {
        if (sheetFail)
          return route.fulfill({
            status: 503,
            json: { error: { message: "test outage" } },
          });
        if (url.pathname === "/v4/spreadsheets" && method === "POST")
          return route.fulfill({ json: { spreadsheetId: "sheet-file" } });
        if (method === "GET")
          return route.fulfill({
            json: {
              sheets: ["読書記録", "好きな一節", "授業で試したいこと"].map(
                (title, sheetId) => ({
                  properties: {
                    title,
                    sheetId,
                    gridProperties: { rowCount: 100, columnCount: 26 },
                  },
                }),
              ),
            },
          });
        return route.fulfill({ json: {} });
      }
      return route.abort();
    });
  }
  await setup(context);
  await page.goto("/");
  await page.getByRole("button", { name: "新しい本を迎える" }).click();
  await page.getByRole("button", { name: "自分で入力する" }).click();
  await page.getByLabel("タイトル").fill("端末をつなぐ本");
  await page.getByRole("button", { name: "この本を登録する" }).click();
  await page
    .getByRole("button", { name: "他の端末と共有する", exact: true })
    .click();
  await page.getByLabel("Google OAuth クライアントID").fill(mockClient);
  await page.getByLabel("利用する Google メールアドレス（任意）").fill(owner);
  await page
    .getByRole("button", { name: "連携設定を保存", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Google でログイン", exact: true })
    .click();
  await expect.poll(() => cloud?.books?.length).toBe(1);
  await expect(page.locator(".sharing-strip")).toContainText("Google と共有中");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  // A local edit made while a remote read is in progress must survive the merge.
  pauseNextRead = true;
  await page.getByRole("button", { name: "共有の設定", exact: true }).click();
  await page.getByRole("button", { name: "今すぐ同期", exact: true }).click();
  await expect.poll(() => Boolean(releaseRead)).toBe(true);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "本棚", exact: true })
    .click();
  await page.getByRole("button", { name: "端末をつなぐ本、の詳細" }).click();
  await page.getByLabel("感想・読書ノート").fill("同期中に書いた感想");
  await page.getByRole("button", { name: "記録を保存", exact: true }).click();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  releaseRead!();
  await expect.poll(() => cloud?.books?.[0]?.notes).toBe("同期中に書いた感想");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("dokushoroku-v1")!).books[0].notes,
      ),
    )
    .toBe("同期中に書いた感想");
  const second = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    await setup(second, true);
    const phone = await second.newPage();
    await phone.goto("http://127.0.0.1:5173/");
    await phone
      .getByRole("button", { name: "他の端末と共有する", exact: true })
      .click();
    await phone
      .getByRole("button", { name: "Google でログイン", exact: true })
      .click();
    await expect(phone.locator(".sharing-strip")).toContainText(
      "Google と共有中",
    );
    await phone.getByRole("button", { name: "閉じる", exact: true }).click();
    await phone
      .getByRole("navigation")
      .getByRole("button", { name: "本棚", exact: true })
      .click();
    await phone.getByRole("button", { name: "端末をつなぐ本、の詳細" }).click();
    await phone.getByLabel("感想・読書ノート").fill("スマホで書いた感想");
    await phone
      .getByRole("button", { name: "記録を保存", exact: true })
      .click();
    await phone.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect
      .poll(() => cloud?.books?.[0]?.notes)
      .toBe("スマホで書いた感想");
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("dokushoroku-v1")!).books[0].notes,
        ),
      )
      .toBe("スマホで書いた感想");
    // Failure to export to Sheets must not block device sharing or erase local work.
    sheetFail = true;
    await phone.bringToFront();
    await phone.getByRole("button", { name: "端末をつなぐ本、の詳細" }).click();
    await phone.getByLabel("感想・読書ノート").fill("シート停止中も記録を守る");
    await phone
      .getByRole("button", { name: "記録を保存", exact: true })
      .click();
    await phone.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect
      .poll(() => cloud?.books?.[0]?.notes)
      .toBe("シート停止中も記録を守る");
    await expect(phone.getByRole("alert")).toContainText(
      "本棚は Google Drive に共有済み",
    );
  } finally {
    await second.close();
  }
});

test("カメラ画面を閉じると撮影を停止する（模擬カメラ）", async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  try {
    const ctx = await browser.newContext({ permissions: ["camera"] });
    const page = await ctx.newPage();
    await page.route("https://**/*", (r) => r.abort());
    await page.goto("http://127.0.0.1:5173/");
    await page.getByRole("button", { name: "新しい本を迎える" }).click();
    await page
      .locator(".register-choices button")
      .filter({
        has: page.getByRole("heading", {
          name: "バーコードを読み取る",
          exact: true,
        }),
      })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(
            (document.querySelector("video")?.srcObject as MediaStream)
              ?.getVideoTracks()
              .some((t) => t.readyState === "live"),
          ),
        ),
      )
      .toBe(true);
    await page.evaluate(() => {
      (window as any).testCamera = document.querySelector("video")!
        .srcObject as MediaStream;
    });
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).testCamera
            .getTracks()
            .every((t: MediaStreamTrack) => t.readyState === "ended"),
        ),
      )
      .toBe(true);
  } finally {
    await browser.close();
  }
});
