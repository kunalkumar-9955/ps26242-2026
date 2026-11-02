import { query } from "../src/lib/db";
import fs from "fs";
import path from "path";

async function runPhase10Migration() {
  console.log("Applying Phase 10 Migration (Hardening, RLS on All Tables, DPDP Retention, Consents, Rate Limiting)...");
  const sqlPath = path.join(__dirname, "../supabase/migrations/20261013000000_phase10_hardening.sql");
  const sql = fs.readFileSync(sqlPath, "utf-8");

  try {
    await query(sql);
    console.log("Phase 10 Migration applied successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

runPhase10Migration();
