# APEX Learning Flow Rulebook v1

Dokumen ini adalah acuan tunggal untuk struktur konten, aturan unlock, dan perilaku layar belajar.

## 1) Tujuan

- Menyamakan logika akademik antara tim produk, konten, dan engineering.
- Menghindari mismatch antara `Learning Hub`, `Modul Materi`, dan data kurikulum.
- Menetapkan aturan yang deterministik (bisa diuji otomatis).

## 2) Hierarki Akademik Resmi

Gunakan struktur berikut sebagai model inti:

`Grade -> Phase -> Subject -> Module -> Lesson -> Assessment (PRE/POST)`

Contoh:

- `SD`
  - `Fase 1`
    - `Matematika`
      - `Modul 1: Operasi Pecahan Dasar`
        - `Lesson 1: Pecahan dasar itu apa?`
          - `Pre-test`
          - `Post-test`

Catatan:

- `SMK/SMA` memiliki fase tambahan: `Spesialisasi`.
- Semua entitas teknis tetap memakai UUID, tetapi admin/user melihat label dan kode akademik yang human-readable.

## 3) Data Inti yang Wajib Ada

### 3.1 Student profile

- `grade_level`: `SD | SMP | SMK | SMA`
- `placement_phase`: integer (minimal 1)
- `placement_locked`: boolean

### 3.2 Module metadata (minimum contract)

- `grade`: `SD | SMP | SMK | SMA`
- `phase`: integer (1..3, atau 4 untuk spesialisasi)
- `subject`: string canonical (contoh: `matematika`, `english`, `coding`)
- `scheduleDays`: array day-key (`mon..sun`)
- `scheduleTime`: `HH:mm`
- `scheduleDuration`: menit
- `scheduleType`: `core | review | project`

### 3.3 Lesson assessment

- `pretest_score` (nullable)
- `posttest_score` (nullable)
- `posttest_passed` (boolean)
- `mastery_threshold` (default 80 jika tidak ditentukan di modul/lesson)

## 4) Aturan Unlock (Normatif)

## 4.1 Baseline akses berdasarkan placement

Untuk siswa dengan `placement_phase = P`:

- Semua konten dengan `phase <= P` terbuka secara baseline.
- Konten `phase > P` terkunci sampai syarat progres terpenuhi.

Ini berarti siswa tidak dipaksa membuka fase di bawah/tepat placement lewat post-test chain.

## 4.2 Gating intra-module (di dalam modul)

- PRE wajib sebelum POST.
- POST lulus jika `score >= mastery_threshold`.
- Lesson berikutnya dalam modul terbuka jika lesson sebelumnya `posttest_passed = true`.

## 4.3 Syarat naik fase

Default v1 (disarankan sederhana):

- `next phase` terbuka jika `>= 80%` lesson pada fase aktif lulus post-test.

Nilai default ini bisa dikonfigurasi global (opsional), tapi tidak berubah per user.

## 5) Perilaku Halaman

## 5.1 Learning Hub

Learning Hub menampilkan:

- modul yang sudah `unlocked` (baseline placement + progression),
- dan `terjadwal hari ini` (`todayOnly`) berdasarkan `scheduleDays`.

Learning Hub fokus pada alur evaluasi:

- buka lesson,
- kerjakan PRE/POST,
- update unlock chain.

## 5.2 Modul Materi

Modul Materi menampilkan semua materi yang sudah unlock untuk review:

- boleh dibuka ulang tanpa wajib menjalankan PRE lagi,
- tidak memblokir akses membaca materi hanya karena test belum dikerjakan saat itu.

Fungsi utama halaman ini adalah pengulangan belajar, bukan eksekusi assessment.

## 6) Kode Human-Readable (untuk admin dan debugging)

Tambahkan field kode tampilan (bukan primary key), contoh:

- `module_code`: `SD-F2-MATH-M1`
- `lesson_code`: `SD-F2-MATH-M1-L3`

Aturan:

- Kode harus unik per grade.
- UUID tetap dipakai untuk relasi database.
- UI admin menampilkan kode + judul untuk mencegah salah pilih ID.

## 7) Aturan Input Konten Admin (v1)

Saat membuat konten, urutan wajib:

1. Pilih `Grade`
2. Pilih `Phase`
3. Pilih `Subject`
4. Pilih/Buat `Module`
5. Tambah `Lesson`
6. PRE/POST quiz otomatis disediakan (auto-seed), lalu bisa diedit

Validasi minimum:

- Tidak boleh membuat lesson tanpa parent module valid.
- Tidak boleh quiz tanpa `lesson_id` valid.
- `scheduleDays` wajib untuk modul yang ingin muncul di Learning Hub harian.

## 8) Acceptance Criteria (siap QA)

Skenario minimal yang harus lolos:

1. Student `SD`, `placement_phase=2`:
   - fase 1 dan 2 muncul sebagai unlocked,
   - fase 3 locked.
2. Student menyelesaikan lesson sesuai threshold:
   - lesson berikutnya terbuka.
3. Learning Hub `todayOnly`:
   - hanya modul dengan `scheduleDays` yang mengandung hari ini.
4. Modul Materi:
   - materi unlocked dapat diakses ulang tanpa harus mulai test baru.
5. PRE guard:
   - POST ditolak jika `pretest_score` belum ada.

## 9) Catatan Implementasi Bertahap

Urutan rollout yang direkomendasikan:

1. Finalisasi kontrak metadata (`grade/phase/subject/schedule*`).
2. Sinkronisasi data lama (backfill).
3. Implementasi query unlock berbasis placement baseline + progression.
4. Sinkronisasi UI Learning Hub dan Modul Materi.
5. Tambahkan smoke tests untuk SD/SMP/SMK.

## 10) Keputusan v1 yang Disepakati

- Placement menentukan baseline akses fase.
- Progress post-test menentukan ekspansi fase berikutnya.
- Learning Hub = jadwal + evaluasi.
- Modul Materi = review materi unlocked.
- UUID tetap teknis; admin melihat kode akademik yang manusiawi.
