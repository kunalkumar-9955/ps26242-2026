import { runIdempotentSeed } from "../src/lib/db/seed";

async function main() {
  console.log("Starting idempotent database seeding on satyarpl_db...");
  const res = await runIdempotentSeed();
  console.log("Seeding finished successfully:", res);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seeding failed with error:", err);
  process.exit(1);
});
