# Learning Flow Implementation Checklist v1

Dokumen ini menurunkan `LEARNING-FLOW-RULEBOOK-V1.md` menjadi checklist eksekusi teknis.

## Status Implementasi

- Status saat ini: **Phase v1 stabil (siap operasional)**.
- Fokus tersisa: backlog non-blokir release (penyempurnaan metadata kode, placement source-of-truth, hardening quiz quality).

## A) Database & Metadata Contract

## A1. Contract metadata module (wajib)

- [x] Hard validation di `admin/content` sudah mewajibkan metadata inti saat create/update module:
  - [x] `grade` (`SD|SMP|SMK|SMA`)
  - [x] `phase` (number)
  - [x] `subject` (canonical string)
  - [x] `scheduleDays` (array day key: `mon..sun`)
  - [x] `scheduleTime` (`HH:mm`)
  - [x] `scheduleDuration` (number > 0)
  - [x] `scheduleType` (`core|review|project`)
- [ ] Audit data lama agar seluruh row historis ikut memenuhi contract.

## A2. Contract kode human-readable (disarankan kuat)

- [x] Tambah standar metadata:
  - [x] `module_code` (contoh `SD-F2-MATH-M1`)
  - [x] `lesson_code` (contoh `SD-F2-MATH-M1-L2`)
- [x] Validasi unik secara aplikasi (minimum).
- [x] SQL guard unik (opsional tahap lanjutan) — sudah ditambahkan via migration `20260411103000_curriculum_code_unique_guards.sql`.

## A3. Student placement baseline

- [x] Sumber kebenaran `placement_phase` untuk user student sudah dipakai di API flow belajar.
- [x] Fallback saat `placement_phase` belum ada sudah didefinisikan eksplisit:
  - [x] fallback ke baseline dari `assessment_session` (mapping product phase), bukan hard default statis.

## A4. Assessment progress fields

- [x] `lesson_progress` punya `pretest_score`, `posttest_score`, `posttest_passed`.
- [x] Guard DB PRE wajib sebelum POST sudah aktif.

---

## B) Data Backfill Operasional

## B1. Backfill jadwal modul

- [x] Script `scripts/backfill-module-schedule.mjs` tersedia.
- [x] Write mode SD sudah dijalankan.
- [x] Jalankan untuk SMP.
- [x] Jalankan untuk SMK/SMA.
- [x] Audit hasil: tidak ada module tanpa `scheduleDays` di grade aktif.

## B2. Backfill quiz PRE/POST

- [x] Script `scripts/seed-minimal-quizzes.mjs` menulis `questions_pre` dan `questions_post`.
- [x] Backfill SD & SMP sudah dijalankan.
- [ ] Jalankan juga untuk SMK/SMA (jika datanya sudah siap).

## B3. Normalisasi metadata phase/subject

- [x] Audit modul yang `metadata.phase` kosong/tidak valid.
- [x] Audit modul yang `metadata.subject` kosong/tidak valid.
- [x] Backfill nilai canonical agar query tidak ambiguity.
- [x] Audit metadata module quality dijalankan (`missingGrade/Phase/Subject = 0`).
- [x] Backfill phase+grade+phaseLabel selesai (ALL grade).
- [x] Backfill subject canonical selesai (ALL grade).

## B4. Deduplikasi konten (courses/modules/lessons/quizzes)

- [x] Deduplikasi course title+grade dijalankan (`dedup:courses`).
- [x] Cleanup course kosong dijalankan (`cleanup:courses:empty`) dan row kosong dihapus.
- [x] Script dedup tree konten aman dibuat (`scripts/dedup-content-tree-safe.mjs`).
- [x] Deduplikasi module duplikat aman dijalankan (`dedup:content:tree`).
- [x] Deduplikasi lesson hanya mode safe-delete (tanpa quiz/progress/attempt, tanpa payload konten).
- [x] Deduplikasi quiz per lesson sudah tersedia (`ops:dedup-quizzes`) untuk maintenance berkala.

---

## C) Endpoint / Query Alignment Map

## C1. Wajib sinkron v1 (core flow)

1. `app/api/learning/modules/route.ts`
   - [x] `todayOnly` strict filter berdasarkan `scheduleDays`.
   - [x] Output modul dipakai untuk kartu Learning Hub.
   - [x] Baseline unlock phase sudah diterapkan (mapping dari placement product phase).
  - [x] Migrasi ke field `placement_phase` eksplisit sudah diterapkan (dengan fallback aman saat field kosong).
  - [x] Pisahkan mode `todayOnly` vs `progression-only` agar debugging mudah (query `mode` pada API modules).

2. `app/api/learning/lesson-assessment/route.ts`
   - [x] PRE required sebelum POST.
   - [x] Reason code/logging untuk block (`PRE_REQUIRED`, `LESSON_LOCKED`).
   - [x] Unlock sudah diselaraskan dengan aturan baru: baseline phase placement + progression intra-module.

3. `app/api/admin/content/route.ts`
   - [x] Validasi UUID payload.
   - [x] Auto-seed PRE/POST saat create lesson.
   - [x] Wajibkan `grade/phase/subject` saat create/update module (hard validation).

4. `app/api/admin/content/bulk-quiz/route.ts`
   - [x] Support bank `legacy/pre/post`.
   - [x] Tambahkan validasi `answer` format + minimum kualitas soal.

## C2. UI yang harus ikut sinkron

1. `components/apex/modules/learning-hub.tsx`
   - [x] Modul tampil sebagai kartu terpisah.
   - [x] Test session tampil popup modal.
   - [x] Progress bar lesson PRE/POST.
   - [x] Tampilkan badge alasan lock (`phase locked`, `lesson locked`, `pre required`).

2. `components/apex/modules/module-materials.tsx`
   - [x] Berfungsi sebagai halaman review.
   - [x] Pastikan data hanya konten unlocked (tanpa memaksa mulai PRE).
   - [x] CTA jelas: "Buka Learning Hub untuk tes".

3. `components/apex/modules/admin-panel.tsx`
   - [x] Validasi input dasar.
   - [x] Wizard input berurutan wajib: Grade -> Phase -> Subject -> Module -> Lesson.
   - [x] Sembunyikan ID mentah; tampilkan kode human-readable.

---

## D) SQL Verification Pack (yang perlu dijalankan rutin)

- [x] `supabase/verify_admin_curriculum_operational.sql`
  - cek metadata phase/subject/track/schedule.
- [x] `supabase/verify_lesson_gating_operational.sql`
  - cek PRE required dan lock behavior.
- [x] `supabase/verify_auth_signup_operational.sql`
  - cek integritas signup trigger.
- [x] `supabase/verify_grade_change_archive_operational.sql`
  - cek trigger archive grade change + integritas snapshot.

## D1. Health monitoring & alert readiness

- [x] Script health check learning flow tersedia (`scripts/health-learning-flow.mjs`).
- [x] NPM command health check tersedia (`npm run health:learning-flow`).
- [x] Cek `module tanpa lesson`.
- [x] Cek `quiz kosong` (missing quiz row / empty pre-post bank).
- [x] Cek `lock reason mismatch` (API check jika smoke token tersedia).
- [x] Baseline health saat ini: `modulesWithoutLesson=0`, `quizEmptyIssue=0`, `lockReasonMismatch=0`.

## D2. Runbook operasional rutin

- [x] Runbook mingguan ditambahkan (`RUNBOOK-OPERASIONAL-MINGGUAN.md`).
- [x] Jalur operasional standar: health check -> audit metadata -> smoke test -> maintenance -> build.

---

## E) Test Plan Minimum (Definition of Done)

## E1. Skenario placement baseline

- [x] Logic smoke lulus untuk baseline mapping phase (`test:learning-flow:logic`).
- [x] Live smoke lulus (`test:learning-flow:live`) untuk baseline unlock flow pada user uji.
- [x] Student SD dengan `placement_phase` baseline tervalidasi via live smoke environment saat ini.
  - [x] Phase baseline terlihat unlocked.
  - [x] Phase di atas baseline tetap lock sesuai rule.

## E2. Skenario progression

- [x] Logic smoke lulus untuk progression unlock lesson (`test:learning-flow:logic`).
- [x] Live smoke lulus (`test:learning-flow:live`) untuk invariants progression unlock lesson.
- [x] PRE dikerjakan -> POST terbuka (targeted live submit scenario).
- [x] POST lulus -> lesson berikutnya unlock (targeted live submit scenario).
- [x] POST belum lulus -> lesson berikutnya tetap lock (targeted live submit scenario).

## E3. Skenario jadwal harian

- [x] Learning Hub `todayOnly` hanya menampilkan modul dengan `scheduleDays` hari ini.
- [x] Tidak muncul modul di luar jadwal hari ini.
- [x] Data smoke lulus (`test:learning-flow:data`): setiap grade aktif punya modul terjadwal hari ini.

## E4. Skenario Modul Materi

- [x] Konten unlocked tetap dapat diakses ulang tanpa tes.
- [x] Tidak ada hard-block test di halaman review.

---

## F) Urutan Eksekusi yang Direkomendasikan (Praktis)

1. Finalkan keputusan sumber `placement_phase`.
2. Hard validation metadata module (`grade/phase/subject/schedule*`) di admin API.
3. Refactor `learning/modules` agar unlock baseline memakai placement_phase.
4. Sinkronkan `lesson-assessment` dengan aturan baseline + progression.
5. Rapikan admin wizard supaya input konten selalu valid by design.
6. Jalankan verify SQL + smoke test.

---

## G) Keputusan Produk (Final)

- [x] Threshold naik fase: `80%` global default (opsi override per grade/course di fase lanjutan).
- [x] `SMK/SMA Spesialisasi` ditetapkan sebagai track terpisah (bukan phase wajib global).
- [x] Jika siswa pindah grade: progression lama diarsipkan, grade baru mulai baseline baru.
- [x] PRE retake: diizinkan dengan cooldown ringan, dan nilai PRE terbaru dipakai untuk gating POST.
- [x] Nilai operasional final didokumentasikan di `RUNBOOK-OPERASIONAL-MINGGUAN.md`.

## G1) Implementasi Pasca-Keputusan (Bertahap)

- [x] Tahap 1: finalisasi dokumen keputusan (`RULEBOOK` + `CHECKLIST`).
- [x] Tahap 1: PRE cooldown guard ditambahkan di `lesson-assessment` API (`PRE_RETAKE_COOLDOWN`).
- [x] Tahap 2: arsip progression saat grade berubah (migration trigger + snapshot archive table).
- [x] Tahap 2: opsi override threshold per grade/course (fallback `module -> course -> 80`).
- [x] Tahap 3: endpoint + panel admin untuk monitoring archive (`/api/admin/grade-change-archives`).
- [x] Tahap 3: SQL verify pack untuk archive grade change ditambahkan.

## H) Backlog Lanjutan (Non-Blocking)

- [x] Finalkan source-of-truth `placement_phase` eksplisit end-to-end di API flow belajar (fallback aman ke assessment session).
- [x] Lengkapi smoke test live untuk assertion source baseline (`placementBaselineSource`).
- [x] Tambahkan validasi kualitas jawaban quiz (`answer` + minimum kualitas soal) di `app/api/admin/content/bulk-quiz/route.ts`.
- [x] Standarkan `module_code` dan `lesson_code` + aturan unik app-level.
- [x] Tambahkan SQL guard unik untuk `module_code` / `lesson_code`.
