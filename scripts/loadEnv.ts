import fs from "fs";
import path from "path";

/**
 * Loads `.env.local` for scripts run outside Next.js.
 *
 * `tsx scripts/foo.ts` does not read env files, and `@/lib/connectDB` throws at
 * *module load* when `MONGODB_URL` is missing. That combination means a script
 * has to call this **before** importing anything that touches the database —
 * which in ESM means those imports must be dynamic, since static imports are
 * hoisted above every statement in the file.
 *
 * Values already present in `process.env` win, so `MONGODB_URL=... npm run ...`
 * still overrides the file.
 */
export function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  for (const raw of fs.readFileSync(envPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) process.env[key] = value;
  }
}
