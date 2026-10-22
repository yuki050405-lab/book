import { build } from "esbuild";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "releases");
await mkdir(output, { recursive: true });
const result = await build({
  absWorkingDir: root,
  entryPoints: ["src/main.tsx"],
  outfile: "portable.js",
  bundle: true,
  external: ["/study.webp"],
  write: false,
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  jsx: "automatic",
  minify: true,
  legalComments: "inline",
  define: {
    "process.env.NODE_ENV": '"production"',
    "import.meta.env.VITE_GOOGLE_CLIENT_ID": '""',
    "import.meta.env.VITE_ALLOWED_EMAIL": '""',
  },
});
const js = result.outputFiles.find((file) => file.path.endsWith(".js")).text;
const image = (await readFile(path.join(root, "public/study.webp"))).toString(
  "base64",
);
const css = result.outputFiles
  .find((file) => file.path.endsWith(".css"))
  .text.replace(/@import\s+(?:url\([^)]*\)|["'][^"']*["'])\s*;/g, "")
  .replaceAll("/study.webp", `data:image/webp;base64,${image}`);
const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#192c25"><title>読書録 — ブラウザお試し版</title><style>${css.replaceAll("</style", "<\\/style")}</style>
<style>.portable-note{display:flex;justify-content:center;align-items:center;gap:12px;padding:10px 20px;background:#eae7d8;color:#5c634e;font:11px/1.8 sans-serif;text-align:center}.portable-note button{background:none;border:0;cursor:pointer;color:inherit;font-size:16px;padding:0 5px}@media print{.portable-note{display:none}}</style>
</head><body><aside class="portable-note" id="portable-note"><span>インストール不要のお試し版です。記録はこのブラウザに保存されます。Google 連携には Web 公開が必要です。</span><button aria-label="お試し版の案内を閉じる" onclick="document.getElementById('portable-note').remove()">×</button></aside><div id="root"></div><noscript>読書録を使うには、ブラウザの JavaScript を有効にしてください。</noscript><script>${js.replaceAll("</script", "<\\/script")}</script></body></html>`;
const target = path.join(output, "読書録.html");
await writeFile(target, html);
console.log(
  `Created ${target} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`,
);
