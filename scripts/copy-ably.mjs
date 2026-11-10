// Copies Ably's prebuilt browser (device) bundle into /public/vendor so the client can load it
// as a plain script. Runs on postinstall.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@ably", "pubsub-device", "dist", "cdn", "ably.min.js");
const destDir = join(root, "public", "vendor");
if (!existsSync(src)) {
  // The bundle is also committed in public/vendor, so a missing node_modules copy is not fatal.
  console.warn("[copy-ably] node_modules bundle not found - using the committed public/vendor file");
  process.exit(0);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, join(destDir, "ably-v3.min.js"));
console.log("[copy-ably] copied pubsub-device ably.min.js -> public/vendor/ably-v3.min.js");
