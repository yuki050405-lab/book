import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const portableURL = "http://127.0.0.1:5173/portable-check";

test("単一 HTML だけで登録・編集・再読み込み・バックアップができる", async ({
  page,
  context,
}, info) => {
  // The managed test browser blocks file:// via administrator policy.
  // Fulfill a single HTML document in memory and disallow all real network access.
  const html = await readFile(path.resolve("releases/読書録.html"), "utf8");
  await context.route("**/*", (route) =>
    route.request().url() === portableURL
      ? route.fulfill({ contentType: "text/html; charset=utf-8", body: html })
      : route.abort(),
  );
  await context.setOffline(true);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(portableURL);
  await expect(page.locator("script[src], link[rel=stylesheet]")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: /本と、ことばと、\s*私のための時間。/ }),
  ).toBeVisible();
  await expect(
    page.getByText("インストール不要のお試し版です。", { exact: false }),
  ).toBeVisible();
  expect(
    await page
      .locator(".hero")
      .evaluate((el) =>
        getComputedStyle(el).backgroundImage.startsWith(
          'url("data:image/webp;base64,',
        ),
      ),
  ).toBe(true);
  await page.getByRole("button", { name: "新しい本を迎える" }).click();
  await page.getByRole("button", { name: "自分で入力する" }).click();
  await page.getByLabel("タイトル").fill("子どもとつくる授業");
  await page.getByLabel("著者", { exact: true }).fill("読書 太郎");
  await page.getByRole("button", { name: "この本を登録する" }).click();
  await expect(page.getByRole("status")).toContainText("登録しました");
  await page.getByRole("button", { name: "本棚を見る", exact: true }).click();
  await page
    .getByRole("button", { name: "子どもとつくる授業、読書 太郎の詳細" })
    .click();
  await page
    .getByLabel("感想・読書ノート")
    .fill("Windows にインストールせず試すための記録");
  await page.getByRole("button", { name: "記録を保存" }).click();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "本棚", exact: true })
    .click();
  await page
    .getByRole("button", { name: "子どもとつくる授業、読書 太郎の詳細" })
    .click();
  await expect(page.getByLabel("感想・読書ノート")).toHaveValue(
    "Windows にインストールせず試すための記録",
  );
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "設定・Google 連携" }).click();
  await expect(
    page.getByRole("button", { name: "Google でログイン" }),
  ).toBeDisabled();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "バックアップを保存" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/読書録-.*\.json/);
  await download.saveAs(info.outputPath("backup.json"));
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.screenshot({
    path: info.outputPath("portable-shelf.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
