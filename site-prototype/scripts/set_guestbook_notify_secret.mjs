// Run locally by the operator. Wrangler reads the existing GAS secret from its
// masked interactive prompt. This wrapper never reads or prints the credential.
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { readTargetConfig, rejectRepeatedOptions } from "./deployment_targets.mjs";
import { notificationVars } from "./guestbook_notification_config.mjs";

const { values, tokens } = parseArgs({ tokens: true, options: { env: { type: "string" } } });
rejectRepeatedOptions(tokens);
const config = await readTargetConfig(values.env);
for (const [key, value] of Object.entries(notificationVars(values.env))) {
  if (config.vars?.[key] !== value) throw new Error("Run prepare and verify notification settings before registering the secret.");
}
console.log(`Verified ${values.env}: Worker ${config.name}; D1 ${config.d1_databases[0].database_id}.`);
console.log("Enter the existing GAS NOTIFY_SECRET at the Wrangler prompt. Do not paste it into chat.");
const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)),
  "secret", "put", "GUESTBOOK_NOTIFY_SECRET", "--config", `.cloudflare/wrangler.${values.env}.json`],
  { cwd: fileURLToPath(new URL("../", import.meta.url)), windowsHide: true, stdio: "inherit" });
child.on("error", () => { console.error("Wrangler could not start."); process.exitCode = 1; });
child.on("close", code => { process.exitCode = code ?? 1; });
