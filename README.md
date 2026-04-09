This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Database Setup (Supabase)

1. Copy env template:

```bash
cp .env.example .env.local
```

2. Fill these variables in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

3. Open Supabase SQL Editor, then run migration file:
- `supabase/migrations/20260407213000_apex_learning_v3.sql`
- `supabase/migrations/20260407235000_admin_settings.sql`
- `supabase/migrations/20260408001000_add_admin_role.sql`
- `supabase/migrations/20260408004000_auth_sync_trigger.sql`
- `supabase/migrations/20260408012000_app_settings_rls.sql`
- `supabase/migrations/20260408022000_backfill_users_from_auth.sql`
- `supabase/migrations/20260408102000_signup_biodata_and_parent_link.sql`
- `supabase/migrations/20260408113000_signup_student_parent_extended_fields.sql`
- `supabase/migrations/20260408153000_assessment_dynamic_calibration_phase1.sql`
- `supabase/migrations/20260408170000_assessment_remediation_queue.sql`
- `supabase/migrations/20260409120000_assessment_four_layer_schema.sql` (Lapis 1 intake + perluasan Lapis 3–4)
- `supabase/migrations/20260409120500_intake_layer1_sample_data.sql` (contoh skenario + item bank)
- `supabase/migrations/20260409140000_assessment_continuous_review.sql` (kolom `last_continuous_review_at`)
- `supabase/migrations/20260409150000_intake_rls.sql` (RLS intake + fungsi `apex_app_user_id()`)

Optional verification SQL:
- `supabase/verify_signup_parent_link.sql`
- `supabase/verify_assessment_calibration.sql` (tabel assessment / calibration)

4. Run app and test DB health endpoint:

```bash
npm run dev
```

Open:
- [http://localhost:3000/api/db/health](http://localhost:3000/api/db/health)

If migration + env are correct, response should contain:
- `"ok": true`
- `"message": "Database connected"`

## Auth Role Sync Notes

- App login uses Supabase Auth (email + password).
- App signup also uses Supabase Auth and sends `options.data.role`.
- After signup, trigger `on_auth_user_created` auto-syncs row to `public.users`.
- To set role on signup, pass metadata role in uppercase (`STUDENT`, `PARENT`, `MENTOR`, `ADMIN`).
- If role is not supplied/invalid, fallback role is `STUDENT`.
- Request middleware guards bearer token presence for:
  - `GET /api/auth/me`
  - `PUT /api/admin/settings`
  - `GET/POST /api/admin/content`
- Database layer also enforces admin-only write on `app_settings` via RLS policy.

## Admin Content APIs

Semua rute di bawah memerlukan Bearer token dan role **ADMIN** (kecuali disebut lain).

- `GET /api/admin/content?type=courses|modules|lessons|quizzes`
- `POST /api/admin/content`
- `PUT /api/admin/content`
- `DELETE /api/admin/content?type=...&id=...`
- `POST /api/admin/content/bulk-quiz`

Body `POST` / `PUT` content:

- `type`: salah satu `courses|modules|lessons|quizzes`
- `payload`: field sesuai tipe

## Parent APIs

Bearer token, role **PARENT**.

- `GET /api/parent/monitoring` — ringkasan anak terhubung, validasi terakhir, alert. Setiap siswa memuat `assessmentProfile` per dimensi sebagai `{ level }` saja (tanpa theta mentah).
- `PATCH /api/parent/monitoring` — tandai satu alert dibaca atau tandai semua alert untuk satu `studentId`.

## Assessment & calibration APIs

Semua rute assessment memakai Bearer Supabase (kecuali cron memakai `CRON_SECRET`).

**Siswa**

- `GET /api/assessment/status` — `provisionalProfile[dim]`: `{ level, confidenceBand }` (`narrow|moderate|wide`). **Tidak** mengembalikan angka theta mentah.
- `GET /api/assessment/intake` — state sesi + wawancara intake (jika ada), daftar `scenarioPrompts` aktif, dan `itemBank` (opsional `?dimension=kognitif&bankLimit=8`). Membuat `assessment_sessions` baris `PENDING` bila belum ada.
- `POST /api/assessment/intake` — body `{ action, ... }`:
  - `start` — mulai `intake_interviews` (satu per sesi).
  - `conversation_turn` — `seqNo`, `role` (`system|assistant|user`), `content`, `metadata?`.
  - `item_attempt` — jejak CAT ringan: `seq`, `dimension`, `learnerResponse`, `bankItemId` (disarankan), `scoredPoints?`, `aiScoreOpen?` (untuk `OPEN_SHORT`: skor otomatis lewat Anthropic + rubrik bank; respons berisi `nextBankItemId`, `thetaEstimateAfter`, `aiRationale?`).
  - `scenario_response` — `promptId`, `response` (JSON).
  - `complete` — `combinedIntakeTheta` (enam dimensi 1–10), ringkasan JSON opsional, `dimensionDisplayLabels`; menandai intake selesai, mengisi `intake_theta`, `status` sesi → `CALIBRATING`, jendela 14 hari, upsert `competency_profiles` sumber `INTAKE` + `equivalent_band_label`.
- `GET /api/assessment/intake` — menambahkan `catHint` (`nextBankItemId`, `thetaEstimate`, `attemptsCount`, `maxCatItems`) saat interview `IN_PROGRESS`.
- `POST /api/assessment/intake/socrates` — siswa, intake aktif: `message`, opsional `language`; menyimpan turn user+assistant di `intake_conversation_turns` (perlu `ANTHROPIC_API_KEY`).
- `GET /api/assessment/remediation` — antre remediasi untuk siswa yang login.
- `POST /api/assessment/learning-events` — catat event pembelajaran ke `calibration_signals` (live, tidak dihapus cron harian). Body: `event` (nama dari `APEX_LEARNING_EVENTS`), opsional `dimension`, `moduleId`, `scorePct`, dll.
- `POST /api/learning/module-session` — **disarankan untuk modul kurikulum**: body `moduleId` (UUID), `scorePct` (0–100), opsional `dimension`, `lessonId`, `metadata`. Upsert `student_progress` + sinyal kalibrasi (selesai sesi, mastery jika baru tercapai, pola lemah jika skor di bawah 55).
- `GET /api/assessment/final-profile` — setelah `PLACED`: `profile[dim]`: `{ level, trend, confidenceBand }`. Plus `recommendedStartModules` dari antre remediasi aktif (slug sederhana per dimensi).

**Orang tua**

- `POST /api/assessment/parent-validation` — validasi penyesuaian untuk anak terhubung lewat **form terstruktur** (tanpa video wawancara). Body: `studentUserId`, `agreedWithProfile`, `adjustments?`, `observations?`, `specialConditions?`, `structuredSession?` (mis. `observationBasis`, `confidenceLevel` dari UI; server menambah `mode: structured_web_form`).
- `GET /api/assessment/final-profile?userId=<student_user_id>` atau `?studentProfileId=<id>` — sama seperti siswa: **profil publik tanpa theta mentah**, hanya untuk anak yang terhubung.

**Mentor / admin**

- `GET /api/assessment/final-profile?userId=<student_user_id>` — role **MENTOR** atau **ADMIN**: `profile[dim]` berisi theta numerik (`finalTheta`, `intakeTheta`, `delta`, `level`, `ci`) untuk baseline override.
- `POST /api/assessment/mentor-override` — override theta per dimensi + alasan; auto-lock sesi jika tidak ada flag terbuka.
- `GET /api/assessment/mentor-students`, `GET /api/assessment/mentor-flags?userId=...`
- `GET /api/assessment/ops` — role **MENTOR** atau **ADMIN**, snapshot operasional.

**Cron (server)**

- `GET /api/cron/nightly-calibration`, `GET /api/cron/placement-lock` — header `Authorization: Bearer <CRON_SECRET>`.
- `GET /api/cron/continuous-placement-review` — siswa `PLACED` + validasi orang tua; jika sudah lewat jendela review berkala (~35 hari sejak anchor terakhir), hitung ulang theta (`calculateFinalPlacement` mode `continuousReviewMode`), upsert `competency_profiles` sumber `CONTINUOUS_REVIEW`, set `last_continuous_review_at`, sinyal live `PLACEMENT_REVIEW_COMPLETED`, opsional flag `ACCELERATION`.

## Seed Test Users

1. Fill these env vars in `.env.local`:
- `APEX_SEED_ADMIN_EMAIL`
- `APEX_SEED_ADMIN_PASSWORD`
- `APEX_SEED_STUDENT_EMAIL`
- `APEX_SEED_STUDENT_PASSWORD`

2. Run:

```bash
npm run seed:test-users
```

Script ini membuat/meng-update 2 pengguna Supabase Auth dan metadata role:

- admin → `ADMIN`
- student → `STUDENT`

## Curriculum Import (MVP)

Struktur kurikulum master disimpan di:

- `data/curriculum/master.schema.json`
- `data/curriculum/sd-foundation-mvp.json` (contoh awal SD)
- `data/curriculum/sd-master-full.json` (hasil ekstraksi SD dari HTML master)
- `data/curriculum/smp-master-full.json` (hasil ekstraksi SMP)
- `data/curriculum/smk-master-full.json` (hasil ekstraksi SMK)
- `data/curriculum/curriculum-master-extracted.json` (gabungan semua jenjang)

Generate file hasil ekstraksi dari `apex-curriculum-master.html`:

```bash
npm run extract:curriculum:all
```

Catatan struktur hasil ekstraksi:
- `module.meta`: `phase`, `subject`, `track` (jika spesialisasi), `gradeLevel`
- `lesson.meta`: `code`, `topic`, `benchmark`

Jalankan import ke tabel `courses`, `modules`, `lessons`, `quizzes`:

```bash
npm run import:curriculum
```

Opsional: ganti file input dengan env berikut:

```bash
APEX_CURRICULUM_FILE=data/curriculum/sd-foundation-mvp.json npm run import:curriculum
```

Mode dry-run (hanya simulasi create/update + report, tanpa write ke DB):

```bash
APEX_CURRICULUM_FILE=data/curriculum/sd-master-full.json APEX_CURRICULUM_DRY_RUN=1 npm run import:curriculum
```

Setelah update ini, jalankan migration terbaru agar metadata kurikulum tersimpan:

- `supabase/migrations/20260409211000_curriculum_content_metadata.sql`

Filter metadata via endpoint admin content (`GET /api/admin/content`):

- `type=modules&phase=Kelas 7 — Transisi & Konsolidasi`
- `type=modules&subject=Matematika Kelas 7`
- `type=lessons&code=7M.1`
- `type=lessons&benchmark=Cambridge LS1`

## Release Checklist (Curriculum + Admin Content)

Gunakan checklist ini sebelum deploy perubahan kurikulum/admin content:

### 1) Database

- Pastikan migration sudah jalan:
  - `supabase/migrations/20260409211000_curriculum_content_metadata.sql`
- Verifikasi kolom metadata ada di:
  - `modules.metadata`
  - `lessons.metadata`

### 2) Data Preparation

- Generate JSON dari HTML master:
  - `npm run extract:curriculum:all`
- Cek file output tersedia:
  - `data/curriculum/sd-master-full.json`
  - `data/curriculum/smp-master-full.json`
  - `data/curriculum/smk-master-full.json`
  - `data/curriculum/curriculum-master-extracted.json`

### 3) Import Safety

- Jalankan dry-run dulu:
  - `APEX_CURRICULUM_FILE=data/curriculum/smp-master-full.json APEX_CURRICULUM_DRY_RUN=1 npm run import:curriculum`
- Pastikan ringkasan `Created/Updated/Errors` masuk akal.
- Jika aman, jalankan mode write (hapus `APEX_CURRICULUM_DRY_RUN`).

### 4) API Verification

- Cek endpoint admin content dengan bearer admin:
  - `GET /api/admin/content?type=modules&phase=...`
  - `GET /api/admin/content?type=modules&subject=...`
  - `GET /api/admin/content?type=lessons&code=...`
  - `GET /api/admin/content?type=lessons&benchmark=...`
- Verifikasi `metadata` ikut muncul di response modules/lessons.

### 5) Admin Panel QA

- Metadata filter (dropdown) berfungsi untuk modules/lessons.
- Recent Items:
  - search + sorting + pagination berjalan normal
  - expand/collapse individual + expand/collapse all
  - select page / select filtered / clear selections
- Export:
  - `Download selected` (JSON) berhasil
  - `Download selected CSV` berhasil
  - preset kolom CSV (`Minimal`, `Curriculum`, `Audit Full`) berfungsi
  - setting kolom CSV tetap tersimpan setelah reload (localStorage)

### 6) Final Gate

- Jalankan `npm run lint`
- (Opsional) Jalankan `npm run verify` jika ingin gate setara CI lokal

## Seed Minimal Quizzes

Jika ingin isi quiz awal otomatis (1-3 lesson pertama per module):

```bash
APEX_CURRICULUM_FILE=data/curriculum/smp-master-full.json APEX_QUIZ_PER_MODULE=1 APEX_CURRICULUM_DRY_RUN=1 npm run seed:quizzes:minimal
```

Jika hasil dry-run sudah sesuai, jalankan mode write:

```bash
APEX_CURRICULUM_FILE=data/curriculum/smp-master-full.json APEX_QUIZ_PER_MODULE=1 npm run seed:quizzes:minimal
```

Catatan:
- `APEX_QUIZ_PER_MODULE` dibatasi `1..3`
- Script tidak menimpa quiz yang sudah ada (`skip if exists`)
- Set `APEX_QUIZ_OVERWRITE=1` jika ingin upgrade quiz yang sudah ada
- (Opsional) Set `APEX_QUIZ_TARGET_LESSON_IDS=<id1,id2,...>` untuk upgrade hanya lesson prioritas (mis. top failure)

Contoh upgrade kualitas quiz existing (dry-run dulu):

```bash
APEX_CURRICULUM_FILE=data/curriculum/smp-master-full.json APEX_QUIZ_PER_MODULE=1 APEX_QUIZ_OVERWRITE=1 APEX_CURRICULUM_DRY_RUN=1 npm run seed:quizzes:minimal
```

Contoh targeted upgrade untuk 5 lesson prioritas:

```bash
APEX_CURRICULUM_FILE=data/curriculum/smp-master-full.json APEX_QUIZ_PER_MODULE=3 APEX_QUIZ_OVERWRITE=1 APEX_QUIZ_TARGET_LESSON_IDS=lesson-id-1,lesson-id-2,lesson-id-3,lesson-id-4,lesson-id-5 APEX_CURRICULUM_DRY_RUN=1 npm run seed:quizzes:minimal
```

## Audit Curriculum Counts

Cek total data curriculum per jenjang (SD/SMP/SMK):

```bash
npm run audit:curriculum
```

## Lesson Pre/Post Test API

Endpoint untuk pre-test / post-test per lesson (student):

- `GET /api/learning/lesson-assessment?moduleId=<uuid>`
  - Return daftar lesson pada module + status unlock + skor pre/post.
- `POST /api/learning/lesson-assessment`
  - Body: `{ lessonId, assessmentType: "PRE" | "POST", answers: string[] }`
  - Rule unlock: lesson berikutnya terbuka jika **POST >= 80** pada lesson saat ini.

## PBL Rubric (IB MYP) + Mentor Assessment

Komponen baru:
- Migration: `supabase/migrations/20260409220000_pbl_rubric_assessment.sql`
- Seed data rubrik: `data/rubrics/pbl-ibmyp-grade9.json`
- Seed script: `npm run seed:rubric:pbl`
- API rubric:
  - `GET /api/assessment/rubrics`
  - Query opsional: `code`, `gradeLevel`, `activeOnly=true|false`
- API assessment:
  - `POST /api/assessment/rubric-assessments` (role `MENTOR|ADMIN`)
  - `GET /api/assessment/rubric-assessments` (mentor/admin bisa filter, student hanya data sendiri)

Urutan implementasi:
1) Jalankan migration terbaru
2) Jalankan `npm run seed:rubric:pbl`
3) Uji fetch rubric:
   - `GET /api/assessment/rubrics?code=R-PBL-IBMYP-09`
4) Uji submit assessment (mentor/admin), body contoh:
```json
{
  "rubricId": "UUID_RUBRIC",
  "studentId": "UUID_STUDENT_PROFILE",
  "projectTitle": "Business Plan Final",
  "notes": "Good market understanding",
  "items": [
    { "criterionId": "UUID_C1", "level": 3, "mentorNote": "Solid idea" },
    { "criterionId": "UUID_C2", "level": 3 },
    { "criterionId": "UUID_C3", "level": 4 },
    { "criterionId": "UUID_C4", "level": 2, "evidenceLink": "https://..." }
  ]
}
```

## Monitoring Operasional Lesson Gating

Untuk dashboard operasional sederhana (SQL):

- Buka file `supabase/verify_lesson_gating_operational.sql`
- Jalankan query di Supabase SQL Editor untuk metrik:
  - pass rate per lesson
  - lesson dengan kegagalan terbanyak
  - rerata attempts sebelum lulus 80 (global + per lesson)

Alternatif otomatis via script (langsung output env siap tempel):

```bash
npm run ops:top-failing-lessons
```

Opsional filter:
- `APEX_TOP_FAILING_LESSONS` (default `5`, range `1..50`)
- `APEX_TOP_FAILING_GRADE_LEVEL` (contoh: `SMP`)

## Backfill Metadata Fase Modul

Agar unlock fase berjenjang (avg post-test >= 80) konsisten, samakan metadata modul:
- `metadata.phase`
- `metadata.phaseOrder`

Jalankan dry-run:

```bash
npm run backfill:module-phases
```

Opsional batasi jenjang tertentu:

```bash
APEX_PHASE_BACKFILL_GRADE=SMP npm run backfill:module-phases
```

Jika hasil dry-run sudah benar, jalankan mode write:

```bash
APEX_PHASE_BACKFILL_WRITE=1 npm run backfill:module-phases
```

## Backfill Metadata Jadwal Modul

Untuk sinkronisasi Learning Hub (todayOnly) dan menu Jadwal Belajar, pastikan modul punya:
- `metadata.scheduleDays` (contoh: `["mon","wed"]`)
- `metadata.scheduleTime` (contoh: `"08:00"`)
- `metadata.scheduleDuration` (contoh: `90`)
- `metadata.scheduleType` (`core|review|project`)

Jalankan dry-run:

```bash
npm run backfill:module-schedule
```

Opsional batasi per jenjang:

```bash
APEX_SCHEDULE_BACKFILL_GRADE=SMP npm run backfill:module-schedule
```

Jika sudah sesuai, jalankan mode write:

```bash
APEX_SCHEDULE_BACKFILL_WRITE=1 npm run backfill:module-schedule
```

## UAT Checklist - Lesson Gating UX

Gunakan checklist ini untuk validasi cepat di staging sebelum go-live:

1) Setup data
- Login sebagai student yang sudah approved.
- Pastikan module punya minimal 2 lesson dan tiap lesson punya quiz aktif.

2) Status badge lesson
- Buka panel `Lesson Gating` di dashboard student.
- Verifikasi badge muncul konsisten:
  - `LOCKED` untuk lesson yang belum terbuka.
  - `UNLOCKED` untuk lesson aktif.
  - `PASSED` setelah post-test >= 80.

3) Guard Post-test
- Pada lesson yang belum pernah pre-test, tombol `Post-test` harus disabled.
- Helper text `Kerjakan Pre-test dulu...` muncul saat post-test belum boleh diakses.

4) Hasil test UX
- Submit pre-test: hasil menampilkan skor + rasio benar/salah (contoh `60% (3/5)`).
- Submit post-test < 80: status gagal + tombol `Ulangi Post-test` muncul.
- Submit post-test >= 80: status lulus + lesson berikutnya berubah menjadi `UNLOCKED`.

5) Persistensi status
- Refresh halaman.
- Pastikan badge/status/score terbaru tetap konsisten dari API.

6) Regression cepat
- Cek module lain pada jenjang sama tetap bisa diakses.
- Jalankan `npm run lint` untuk memastikan tidak ada error frontend baru.

## Dedup Duplicate Courses

Jika audit menunjukkan course duplikat pada jenjang yang sama, jalankan:

```bash
npm run dedup:courses
```

Default adalah **dry-run** (hanya simulasi). Untuk eksekusi write:

```bash
APEX_DEDUP_WRITE=1 npm run dedup:courses
```

Proses dedup:
- pilih course canonical (created_at paling awal)
- pindahkan semua `modules.course_id` dari duplikat ke canonical
- hapus row course duplikat

## Cleanup Empty Courses

Untuk membersihkan course lama yang tidak punya module:

```bash
npm run cleanup:courses:empty
```

Default dry-run. Untuk eksekusi write:

```bash
APEX_CLEANUP_WRITE=1 npm run cleanup:courses:empty
```

## Calibration Test Check

Jalankan smoke test formula calibration:

```bash
npm run test:calibration
```

Untuk satu perintah **lint + calibration + production build** (setara gate CI):

```bash
npm run verify
```

Jika lolos `test:calibration`, akan muncul output:
- `Calibration checks passed.`

Jika repositori Git Anda di-root `APEX-LEARNING-SYSTEM` (folder `apex-frontend` di dalamnya), GitHub Actions menjalankan hal yang sama lewat `.github/workflows/ci.yml`.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
