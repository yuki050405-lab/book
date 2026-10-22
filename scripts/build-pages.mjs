import { execFileSync } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "build", "--", "--base=/book/"],
  { cwd: root, stdio: "inherit" },
);
await mkdir(path.join(root, "docs"), { recursive: true });
await cp(path.join(root, "dist"), path.join(root, "docs"), { recursive: true });
await writeFile(path.join(root, "docs", ".nojekyll"), "");
console.log("Prepared docs/ for GitHub Pages (main branch, /docs folder).");
