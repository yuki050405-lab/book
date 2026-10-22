import { test, expect, Page } from "@playwright/test";
async function register(page: Page, title = "小学校の授業づくり") {
  await page.getByRole("button", { name: "新しい本を迎える" }).click();
  await page.getByRole("button", { name: "自分で入力する" }).click();
  await page.getByLabel("タイトル").fill(title);
  await page.getByLabel("著者", { exact: true }).fill("山田 花子");
  await page.getByRole("button", { name: "この本を登録する" }).click();
  await expect(page.getByRole("status")).toContainText("登録しました");
}
test.beforeEach(async ({ page }) => {
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
  await page.route("https://images.unsplash.com/**", (r) => r.abort());
  await page.goto("/");
});
test("登録→本棚→読書記録→一節→実践→再読み込みで保存を確認", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: /本と、ことばと、\s*私のための時間。/ }),
  ).toBeVisible();
  await register(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "本棚", exact: true })
    .click();
  await page
    .getByRole("button", { name: "小学校の授業づくり、山田 花子の詳細" })
    .click();
  await page.getByLabel("読書状況").selectOption("読了");
  await page.getByLabel("感想・読書ノート").fill("対話の時間を大切にしたい");
  await page.getByRole("button", { name: "好きな一節", exact: true }).click();
  await page.getByLabel("新しい一節").fill("問いを育てる");
  await page
    .getByLabel("ページ・位置番号・章（任意）", { exact: true })
    .fill("第3章");
  await page.getByRole("button", { name: "一節を追加", exact: true }).click();
  await page.getByRole("button", { name: "授業で試す", exact: true }).click();
  await page.getByLabel("次に試したいこと").fill("朝の対話を取り入れる");
  await page.getByRole("button", { name: "実践メモを追加" }).click();
  await page.getByRole("button", { name: "記録を保存" }).click();
  await expect(page.getByText("未保存の変更があります")).toHaveCount(0);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "本棚", exact: true })
    .click();
  await page
    .getByRole("button", { name: "小学校の授業づくり、山田 花子の詳細" })
    .click();
  await expect(page.getByLabel("感想・読書ノート")).toHaveValue(
    "対話の時間を大切にしたい",
  );
  await expect(page.getByLabel("読書状況")).toHaveValue("読了");
  await page.getByRole("button", { name: "好きな一節", exact: true }).click();
  await expect(page.getByLabel("一節の内容")).toHaveValue("問いを育てる");
  await page.getByRole("button", { name: "授業で試す", exact: true }).click();
  await expect(page.getByLabel("試したいこと", { exact: true })).toHaveValue(
    "朝の対話を取り入れる",
  );
});
test("電子書籍を検索結果から登録し、重複を防ぐ", async ({ page }) => {
  await page.route("https://www.googleapis.com/books/**", (r) =>
    r.fulfill({
      json: {
        items: [
          {
            volumeInfo: {
              title: "学級経営の本",
              authors: ["著者A"],
              description: "小学校の学級づくり",
              categories: ["教育"],
            },
          },
        ],
      },
    }),
  );
  await page.getByRole("button", { name: "新しい本を迎える" }).click();
  await page.getByRole("button", { name: "書名・著者で探す" }).click();
  await page.getByRole("textbox", { name: "書籍情報を検索" }).fill("学級経営");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.getByRole("button", { name: "学級経営の本 著者A" }).click();
  await expect(page.getByLabel("形式")).toHaveValue("電子書籍");
  await expect(page.getByLabel("教育の分類")).toHaveValue("学級経営・生徒指導");
  await page.getByRole("button", { name: "この本を登録する" }).click();
  await register(page, "学級経営の本"); // different author: distinct book
  await page.getByRole("button", { name: "新しい本を迎える" }).click();
  await page.getByRole("button", { name: "自分で入力する" }).click();
  await page.getByLabel("タイトル").fill("学級経営の本");
  await page.getByLabel("著者", { exact: true }).fill("著者A");
  await page.getByRole("button", { name: "この本を登録する" }).click();
  await expect(page.getByRole("status")).toContainText("登録済み");
});
test("感想検索とデータ集計、スマートフォンの横はみ出しを確認", async ({
  page,
}) => {
  await register(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "本棚", exact: true })
    .click();
  await page.getByRole("textbox", { name: "本を検索" }).fill("見つからない");
  await expect(
    page.getByRole("heading", { name: "該当する本がありません" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "本を検索" }).fill("授業");
  await expect(
    page.getByRole("button", { name: "小学校の授業づくり、山田 花子の詳細" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "書斎", exact: true }).click();
  await page
    .locator(".entry-card")
    .filter({ has: page.getByRole("heading", { name: "これまでのデータ" }) })
    .click();
  await expect(
    page.getByRole("heading", { name: "これまでのデータ", exact: true }),
  ).toBeVisible();
});
test("ホーム画面の表示を記録", async ({ page }, info) => {
  await page.screenshot({ path: info.outputPath("home.png"), fullPage: true });
});
