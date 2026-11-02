import { query } from "../src/lib/db";
import fs from "fs";
import path from "path";

async function runPhase8Migration() {
  console.log("Applying Phase 8 Migration (Credential Issuance & Public Verification)...");
  const sqlPath = path.join(__dirname, "../supabase/migrations/20261011000002_credential_issuance.sql");
  const sql = fs.readFileSync(sqlPath, "utf-8");

  try {
    await query(sql);
    console.log("Phase 8 Migration applied successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

runPhase8Migration();
