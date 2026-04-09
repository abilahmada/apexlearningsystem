# Deployment Guide (Vercel + Supabase)

Panduan ini dibuat khusus untuk project `apex-frontend` (Next.js + Supabase).

## 1) Prasyarat

- Repo sudah ada di GitHub.
- Sudah punya akun:
  - [Vercel](https://vercel.com)
  - [Supabase](https://supabase.com)
- Aplikasi lokal sudah lolos:
  - `npm run lint`
  - `npm run build`

## 2) Pastikan Migration Supabase Terbaru

Jalankan migration ini di Supabase SQL Editor (berurutan):

1. `supabase/migrations/20260407213000_apex_learning_v3.sql`
2. `supabase/migrations/20260407235000_admin_settings.sql`
3. `supabase/migrations/20260408001000_add_admin_role.sql`
4. `supabase/migrations/20260408004000_auth_sync_trigger.sql`
5. `supabase/migrations/20260408012000_app_settings_rls.sql`
6. `supabase/migrations/20260408022000_backfill_users_from_auth.sql`
7. `supabase/migrations/20260408102000_signup_biodata_and_parent_link.sql`
8. `supabase/migrations/20260408113000_signup_student_parent_extended_fields.sql`
9. `supabase/migrations/20260408153000_assessment_dynamic_calibration_phase1.sql`
10. `supabase/migrations/20260408170000_assessment_remediation_queue.sql`
11. `supabase/migrations/20260409120000_assessment_four_layer_schema.sql`
12. `supabase/migrations/20260409120500_intake_layer1_sample_data.sql`

Opsional verifikasi:
- `supabase/verify_signup_parent_link.sql`
- `supabase/verify_assessment_calibration.sql`

## 3) Deploy ke Vercel

1. Login Vercel.
2. Klik **Add New Project**.
3. Import repo GitHub project ini.
4. Framework akan terdeteksi sebagai **Next.js**.
5. Klik **Deploy**.

## 4) Environment Variables di Vercel (Wajib)

Masuk ke Project Settings -> Environment Variables, lalu isi:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` (untuk proteksi endpoint cron internal)
- `ANTHROPIC_API_KEY` (jika fitur chat Socrates aktif pakai Anthropic)
- `ANTHROPIC_MODEL` (opsional, default sudah ada fallback di code)

Catatan:
- `SUPABASE_SERVICE_ROLE_KEY` hanya untuk server-side route.
- Jangan expose key ini ke frontend.
- `CRON_SECRET` harus sama dengan header `Authorization: Bearer <CRON_SECRET>` saat trigger manual cron.

## 5) Konfigurasi Supabase Auth (Sangat Penting)

Supabase -> Authentication -> URL Configuration:

- **Site URL**:
  - `https://<your-vercel-domain>.vercel.app`
- **Redirect URLs** (tambahkan minimal):
  - `https://<your-vercel-domain>.vercel.app`
  - `https://<your-vercel-domain>.vercel.app/`

Jika pakai custom domain, tambahkan juga:
- `https://<your-custom-domain>`
- `https://<your-custom-domain>/`

Ini penting agar link verifikasi email dapat diklik dan mengarah benar.

## 6) Uji Go-Live (Checklist)

### Auth & Signup
- [ ] Signup parent berhasil.
- [ ] Field parent required (ID orang tua, no hp, alamat) tervalidasi.
- [ ] Signup student berhasil dengan parent ID.
- [ ] Field student required (tanggal lahir, asal sekolah, kelas) tervalidasi.
- [ ] Email verifikasi bisa diklik dan confirm sukses.

### Relasi Parent-Student
- [ ] Student otomatis terhubung ke parent via `parent_link_code`.
- [ ] Parent dashboard menampilkan anak terhubung.
- [ ] Badge alert per anak muncul.
- [ ] Tombol mark as read / mark all read berfungsi.

### Aplikasi Umum
- [ ] `/api/db/health` merespons sukses.
- [ ] `/api/chat` bisa stream jawaban AI.
- [ ] Bilingual toggle ID/EN berfungsi.
- [ ] Mobile floating Socrates tidak mengganggu bottom nav.
- [ ] `GET /api/cron/nightly-calibration` sukses dengan bearer `CRON_SECRET`.
- [ ] `GET /api/cron/placement-lock` sukses dengan bearer `CRON_SECRET`.

### Assessment Dynamic Calibration (Phase 2 QA)
- [ ] **Student flow**: `GET /api/assessment/status` mengembalikan status + `provisionalProfile` untuk akun student.
- [ ] **Student flow**: `GET /api/assessment/final-profile` return `409` sebelum status `PLACED`, lalu return profil final setelah `PLACED`.
- [ ] **Student flow**: `GET /api/assessment/remediation` menampilkan daftar remediasi jika ada gap yang terdeteksi.
- [ ] **Parent flow**: card Parent Analytics menampilkan radar chart real 6 dimensi (bukan data statis).
- [ ] **Parent flow**: `POST /api/assessment/parent-validation` berhasil simpan adjustment + observations.
- [ ] **Parent flow**: `GET /api/assessment/final-profile?studentProfileId=<id>` berhasil untuk anak terhubung dan gagal (`403`) untuk anak yang tidak terhubung.
- [ ] **Mentor flow**: `GET /api/assessment/mentor-students` memuat daftar siswa untuk selector override.
- [ ] **Mentor flow**: `GET /api/assessment/mentor-flags?userId=<student_user_id>` memuat unresolved flags.
- [ ] **Mentor flow**: `POST /api/assessment/mentor-override` berhasil update `competency_profiles` source=`MENTOR_OVERRIDE`.
- [ ] **Mentor flow**: setelah override, unresolved flags berkurang dan `autoLocked=true` jika semua flag terselesaikan.
- [ ] **Data integrity**: `assessment_sessions.final_theta` terisi saat lock, dan `placement_locked_at` tidak null.
- [ ] **Observability**: `GET /api/assessment/ops` (admin/mentor) menunjukkan metrik masuk akal (`unresolvedFlags`, `signalsLast24h`, dll).

### Runbook Cepat (Jika Check Gagal)
- **`/api/assessment/status` gagal/401** -> pastikan user login sebagai student dan header Bearer token valid.
- **`/api/assessment/final-profile` selalu 409** -> cek `assessment_sessions.status`; jalankan cron lock atau selesaikan unresolved flags via mentor override.
- **Parent tidak bisa akses final-profile anak (403)** -> verifikasi relasi `student_profiles.parent_id` sesuai `parent_profiles.id`.
- **Mentor tidak melihat daftar siswa** -> cek role user di `public.users` adalah `MENTOR`; pastikan endpoint `GET /api/assessment/mentor-students` tidak diblok env/auth.
- **Mentor flags kosong padahal kasus pending** -> cek tabel `calibration_flags` apakah `resolved=false` untuk user tersebut.
- **Override sukses tapi tidak auto-lock** -> cek masih ada unresolved flags lain; cek juga `assessment_sessions.status` dan `final_theta`.
- **`final_theta` null saat status PLACED** -> jalankan ulang `GET /api/cron/placement-lock` dengan bearer `CRON_SECRET`, lalu cek log error route.
- **Data radar parent tidak update** -> pastikan ada data di `competency_profiles` atau fallback `assessment_sessions.(final_theta/intake_theta)`.
- **Nilai aneh di profile** -> jalankan `supabase/verify_assessment_calibration.sql`, audit sinyal 14 hari dan source profile (`CALIBRATION` vs `MENTOR_OVERRIDE`).

## 7) Domain Kustom (Opsional)

1. Vercel -> Project -> Domains -> Add Domain.
2. Ikuti instruksi DNS.
3. Setelah domain aktif, update lagi Supabase:
   - Site URL + Redirect URLs ke domain final.

## 8) Troubleshooting Cepat

### Link verifikasi email tidak jalan
- Cek Site URL + Redirect URLs di Supabase.
- Pastikan domain production sudah benar dan HTTPS.

### Signup berhasil tapi tidak bisa login app
- Cek trigger sync auth -> `public.users`.
- Jalankan `20260408022000_backfill_users_from_auth.sql`.

### Parent tidak melihat data anak
- Pastikan `parent_link_code` parent dan student sama.
- Cek `student_profiles.parent_id` terisi.
- Jalankan query di `supabase/verify_signup_parent_link.sql`.

## 9) Rekomendasi Operasional

- Aktifkan preview deployment untuk branch non-main.
- Gunakan satu project Supabase untuk production, satu untuk staging.
- Simpan semua migration baru di folder `supabase/migrations`.

