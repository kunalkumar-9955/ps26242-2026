import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres@localhost:5432/satyarpl_db";

// Global pool instance for Next.js and scripts
const globalForDb = globalThis as unknown as {
  dbPool?: Pool;
};

export const pool =
  globalForDb.dbPool ||
  new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.dbPool = pool;
}

export async function query<T = any>(
  text: string,
  params?: any[],
  userRole?: string
): Promise<{ rows: T[]; rowCount: number }> {
  const client = await pool.connect();
  try {
    if (userRole) {
      // Set session variable for RLS
      await client.query("SELECT set_config('app.current_user_role', $1, false)", [
        userRole,
      ]);
    }
    const res = await client.query(text, params);
    return { rows: res.rows, rowCount: res.rowCount ?? 0 };
  } finally {
    if (userRole) {
      await client.query("SELECT set_config('app.current_user_role', '', false)").catch(() => {});
    }
    client.release();
  }
}
