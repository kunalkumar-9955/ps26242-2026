import { pool } from "../src/lib/db";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("Applying Phase 5 migration...");
  const migrationPath = path.join(__dirname, "../supabase/migrations/20261010000002_offline_sync.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");
  await pool.query(sql);
  console.log("Phase 5 migration applied successfully!");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
