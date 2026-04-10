# Learning Flow Implementation Checklist v1

Dokumen ini menurunkan `LEARNING-FLOW-RULEBOOK-V1.md` menjadi checklist eksekusi teknis.

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

- [ ] Tambah standar metadata:
  - [ ] `module_code` (contoh `SD-F2-MATH-M1`)
  - [ ] `lesson_code` (contoh `SD-F2-MATH-M1-L2`)
- [ ] Validasi unik secara aplikasi (minimum) + SQL guard (opsional tahap 2).

## A3. Student placement baseline

- [ ] Pastikan ada sumber kebenaran `placement_phase` untuk user student.
- [ ] Definisikan fallback jika `placement_phase` belum ada:
  - [ ] default ke `phase=1` (atau kebijakan bisnis lain, harus eksplisit).

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
   - [ ] Migrasi ke field `placement_phase` eksplisit jika/ketika field itu sudah menjadi source of truth.
   - [ ] Pisahkan mode `todayOnly` vs `progression-only` agar debugging mudah.

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
   - [ ] Tambahkan validasi `answer` format + minimum kualitas soal.

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

## D1. Health monitoring & alert readiness

- [x] Script health check learning flow tersedia (`scripts/health-learning-flow.mjs`).
- [x] NPM command health check tersedia (`npm run health:learning-flow`).
- [x] Cek `module tanpa lesson`.
- [x] Cek `quiz kosong` (missing quiz row / empty pre-post bank).
- [x] Cek `lock reason mismatch` (API check jika smoke token tersedia).
- [x] Baseline health saat ini: `modulesWithoutLesson=0`, `quizEmptyIssue=0`, `lockReasonMismatch=0`.

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

- [ ] Konten unlocked tetap dapat diakses ulang tanpa tes.
- [ ] Tidak ada hard-block test di halaman review.

---

## F) Urutan Eksekusi yang Direkomendasikan (Praktis)

1. Finalkan keputusan sumber `placement_phase`.
2. Hard validation metadata module (`grade/phase/subject/schedule*`) di admin API.
3. Refactor `learning/modules` agar unlock baseline memakai placement_phase.
4. Sinkronkan `lesson-assessment` dengan aturan baseline + progression.
5. Rapikan admin wizard supaya input konten selalu valid by design.
6. Jalankan verify SQL + smoke test.

---

## G) Keputusan Pending (Butuh Keputusan Produk)

- [ ] Threshold naik fase: tetap 80% atau beda per grade?
- [ ] Untuk `SMK/SMA Spesialisasi`: apakah dianggap `phase=4` atau track terpisah? jadikan ini unlock untuk grade SMK/SMA sebagai materi khusus seperti ekstrakulikuler
- [ ] Jika siswa pindah grade, apakah progression lama direset atau dimigrasikan?
- [ ] Apakah PRE boleh retake unlimited? (saat ini praktiknya boleh)
