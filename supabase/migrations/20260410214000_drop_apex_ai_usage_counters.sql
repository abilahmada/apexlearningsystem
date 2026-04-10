-- Hapus tabel pemantauan token internal (limit & email) — billing dipantau di konsol Anthropic.
DROP INDEX IF EXISTS public.idx_apex_ai_usage_period;
DROP TABLE IF EXISTS public.apex_ai_usage_counters;
