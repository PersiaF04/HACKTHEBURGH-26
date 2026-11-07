// Copies contract fixtures, then real producer outputs on top, into web/public/data.
// Real files in data/public/ win; fixtures fill any gaps so the app always renders (R-7).
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const target = join(root, "web", "public", "data");
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const source of [join(root, "contracts", "fixtures"), join(root, "data", "public")]) {
  if (existsSync(source)) cpSync(source, target, { recursive: true });
}
console.log("data synced to web/public/data");
