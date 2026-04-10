/**
 * Menjalankan migrasi SQL reconcile posttest_passed vs modules.mastery_threshold.
 *
 * Usage (PowerShell):
 *   $env:DATABASE_URL = "postgresql://postgres.[PROJECT]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"
 *   npm run db:apply:reconcile
 *
 * URI: Supabase Dashboard → Project Settings → Database → Connection string → URI (gunakan password DB).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const sqlPath = path.join(
  root,
  "supabase",
  "migrations",
  "20260410220000_reconcile_lesson_posttest_passed_module_threshold.sql",
);

const url = process.env.DATABASE_URL;
if (!url || !String(url).trim()) {
  console.error(
    "DATABASE_URL tidak diset. Contoh (PowerShell):\n  $env:DATABASE_URL = \"postgresql://postgres....\"\n  npm run db:apply:reconcile",
  );
  process.exit(1);
}

if (!fs.existsSync(sqlPath)) {
  console.error("File migrasi tidak ditemukan:", sqlPath);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf8");
const client = new pg.Client({ connectionString: url.trim() });

try {
  await client.connect();
  await client.query(sql);
  console.log("Selesai: reconcile lesson_progress diterapkan.");
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
