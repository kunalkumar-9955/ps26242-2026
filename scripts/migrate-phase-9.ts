import { query } from "../src/lib/db";
import fs from "fs";
import path from "path";

async function runPhase9Migration() {
  console.log("Applying Phase 9 Migration (Red-Team Runner & Sealed Evidence Guard)...");
  const sqlPath = path.join(__dirname, "../supabase/migrations/20261012000000_red_team_runner.sql");
  const sql = fs.readFileSync(sqlPath, "utf-8");

  try {
    await query(sql);
    console.log("Phase 9 Migration applied successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

runPhase9Migration();
