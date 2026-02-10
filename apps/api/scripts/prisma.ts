import { spawnSync } from "node:child_process";
import path from "node:path";

import dotenv from "dotenv";

// Prisma CLI loads `.env` relative to the schema file. In this repo we keep a single
// root `.env`, so we load it explicitly for `npm run db:*` workflows.
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

const args = process.argv.slice(2);
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["prisma", ...args], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);

