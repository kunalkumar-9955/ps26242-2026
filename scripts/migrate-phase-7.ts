import { pool } from "../src/lib/db";
import fs from "fs";
import path from "path";

async function main() {
  const sqlPath = path.join(__dirname, "../supabase/migrations/20261011000001_auditor_analytics.sql");
  const sql = fs.readFileSync(sqlPath, "utf-8");

  console.log("Applying Phase 7 migration to satyarpl_db...");
  try {
    await pool.query(sql);
    console.log("Phase 7 migration applied successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
