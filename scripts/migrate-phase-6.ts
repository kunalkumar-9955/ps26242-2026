import { pool } from "../src/lib/db";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("Applying Phase 6 migration to satyarpl_db...");
  const migrationPath = path.join(__dirname, "../supabase/migrations/20261011000000_assessor_workflow.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");
  await pool.query(sql);
  console.log("Phase 6 migration applied successfully!");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
