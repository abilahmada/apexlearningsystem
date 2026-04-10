# Runbook Operasional Mingguan

Dokumen ini untuk cek rutin kestabilan learning flow tanpa harus investigasi manual.

## 1) Pre-check cepat

- Pastikan branch kerja sudah sinkron dengan `main`.
- Pastikan ENV server utama aktif (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- Jalankan dari root `apex-frontend`.

## 2) Health check data inti

Jalankan:

```bash
npm run health:learning-flow
```

Lolos jika:

- `modulesWithoutLessonCount = 0`
- `quizEmptyIssueCount = 0`
- `lockReasonMismatchCount = 0` (atau `N/A` jika API lock-check tidak diaktifkan token smoke)

## 3) Audit metadata modul

Jalankan:

```bash
npm run audit:module-metadata
```

Lolos jika tidak ada spike pada:

- `missingGrade`
- `missingPhase`
- `missingSubject`
- `invalidScheduleDays`
- `invalidScheduleTime`
- `invalidScheduleDuration`
- `invalidScheduleType`

## 4) Smoke test flow belajar

Jalankan berurutan:

```bash
npm run test:learning-flow:logic
npm run test:learning-flow:live
npm run test:learning-flow:submit
npm run test:learning-flow:data
```

Tujuan:

- logic gating tetap konsisten
- endpoint live tidak regress
- submit PRE/POST tidak rusak
- schedule harian tetap ada per grade

## 5) Maintenance data bila ada temuan

Jika ada temuan duplikasi/kosong:

```bash
npm run dedup:content:tree
npm run dedup:courses
npm run cleanup:courses:empty
```

Jika ada quiz kosong:

```bash
npm run fill:quizzes:ai:missing
```

## 6) Checklist deploy/PR

- Cek build:

```bash
npm run build
```

- Pastikan PR checks hijau:
  - Vercel: Ready
  - Supabase preview/migrations: success atau expected skip (jika tidak ada perubahan `supabase/`)

## 7) Rollback cepat

Jika deploy regress:

1. Revert commit terakhir di branch perbaikan.
2. Push revert.
3. Pastikan Vercel redeploy dari commit revert.
4. Ulangi langkah 2-4 runbook ini sebelum merge ulang.

## 8) Default operasional sementara (menunggu keputusan produk final)

- Threshold kelulusan post-test: `80` (berlaku umum).
- PRE retake: diizinkan.
- Baseline level siswa: mengikuti hasil placement saat ini.
- Spesialisasi SMK/SMA: sementara diperlakukan sebagai perluasan level/track tanpa memaksa migrasi progres lama.

