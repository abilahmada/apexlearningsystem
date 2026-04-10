# Release Handover — Learning Flow v1

Dokumen ini merangkum status implementasi final, cara operasi rutin, dan backlog non-blocking setelah hardening learning flow.

## 1) Status Rilis

- Status: **siap operasional** untuk flow belajar harian.
- Area utama yang sudah stabil:
  - baseline unlock + progression lesson,
  - PRE/POST guard + cooldown,
  - hardening admin content flow,
  - data health snapshot + grade-change archive snapshot,
  - SQL verify pack operasional.

## 2) Perubahan Kunci yang Sudah Live

- `placement_phase` dipakai sebagai source baseline utama di endpoint belajar, dengan fallback aman ke assessment session.
- PRE wajib sebelum POST tetap enforced (API + DB trigger).
- PRE retake diizinkan dengan cooldown (`PRE_RETAKE_COOLDOWN`).
- Mastery threshold fallback resmi: `module.mastery_threshold -> course.mastery_threshold -> 80`.
- Grade change:
  - progres lama diarsipkan ke `student_progress_grade_archives`,
  - progres aktif lesson/attempt direset untuk baseline grade baru.
- Admin content:
  - validasi payload lebih ketat,
  - bulk quiz hardening (`answer` format + kualitas minimum row),
  - support metadata code human-readable.
- Guard unik kode kurikulum:
  - app-level uniqueness check untuk `module_code` / `lesson_code`,
  - SQL unique index guard via migration.

## 3) Endpoint/Panel Operasional Penting

- Learning modules:
  - `GET /api/learning/modules?todayOnly=1`
  - `GET /api/learning/modules?mode=todayOnly`
  - `GET /api/learning/modules?mode=progression-only`
- Lesson assessment:
  - `GET /api/learning/lesson-assessment`
  - `POST /api/learning/lesson-assessment`
- Admin monitoring:
  - `GET /api/admin/health-learning-flow`
  - `GET /api/admin/grade-change-archives`

## 4) Script Operasional Mingguan

Jalankan berurutan dari root `apex-frontend`:

```bash
npm run health:learning-flow
npm run audit:module-metadata
npm run test:learning-flow:logic
npm run test:learning-flow:live
npm run test:learning-flow:submit
npm run test:learning-flow:data
```

Jika perlu verify SQL:

- `supabase/verify_admin_curriculum_operational.sql`
- `supabase/verify_lesson_gating_operational.sql`
- `supabase/verify_auth_signup_operational.sql`
- `supabase/verify_grade_change_archive_operational.sql`

## 5) Migrations Penting (Batch terbaru)

- `20260411100000_courses_mastery_threshold_override.sql`
- `20260411101000_archive_progress_on_grade_change.sql`
- `20260411103000_curriculum_code_unique_guards.sql`

Catatan: bila `supabase db pull` gagal di Windows, pastikan Docker Desktop aktif (dibutuhkan untuk shadow database).

## 6) Backlog Non-Blocking (Next)

- Tambah SQL verify khusus validitas `module_code` / `lesson_code` (coverage audit lebih detail).
- Tambah smoke live scenario khusus siswa SMK/SMA dengan data representatif.
- Rapikan data historis lama yang belum punya metadata code terstandar (batch cleanup terpisah).

## 7) Definisi Selesai Operasional

Rilis dianggap sehat jika:

- health snapshot tidak menunjukkan anomali kritikal,
- smoke logic/live/submit/data lulus,
- tidak ada mismatch pada verify SQL untuk lesson gating dan archive integrity.
