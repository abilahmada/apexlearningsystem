# Peta Implementasi vs Master Blueprint APEX (v1)

**Tanggal dokumen:** 2026-04-11  
**Status:** dokumen hidup — perbarui saat fitur atau keputusan produk berubah.

## 1. Tujuan dokumen ini

1. Menjembatani **`master-blueprint.md`** (narasi visi & tujuh pilar) dengan **`LEARNING-FLOW-RULEBOOK-V1.md`** (kontrak operasional alur belajar) dan **kode** di repo `apex-frontend`.
2. Memberi label **Selesai**, **Parsial**, **Belum (v1)**, atau **Risiko / R&D** agar perencanaan sprint tidak mencampur white paper dengan komitmen engineering yang sudah distabilkan.
3. Menjadi acuan tim produk + engineering untuk **prioritas v2** tanpa mengubah rulebook kecuali ada keputusan eksplisit.

## 2. Sumber kebenaran (urutan baca)

| Lapisan | File / area | Peran |
|--------|-------------|--------|
| Visi & metodologi | `master-blueprint.md` | Arah produk jangka panjang; bukan checklist QA. |
| Alur belajar operasional | `LEARNING-FLOW-RULEBOOK-V1.md` | Aturan deterministik Hub, modul, lesson, PRE/POST, unlock. |
| Eksekusi teknis | `LEARNING-FLOW-IMPLEMENTATION-CHECKLIST-V1.md` | Centang fitur yang sudah diuji / dirilis. |
| Kode | `app/`, `components/`, `lib/`, `app/api/` | Implementasi aktual. |

## 3. Legenda status

| Status | Arti |
|--------|------|
| **Selesai** | Ada di produk dengan perilaku yang memadai narasi blueprint (boleh sempurna secara bertahap). |
| **Parsial** | Fondasi atau UI ada; narasi blueprint belum terpenuhi penuh atau sebagian data masih demo. |
| **Belum (v1)** | Tidak ada implementasi bermakna yang dipetakan ke narasi ini dalam repo saat ini. |
| **Risiko / R&D** | Memungkinkan secara teknis tetapi butuh investasi besar, integrasi pihak ketiga, atau kebijakan anak / legal. |

---

## 4. Tujuh pilar metodologi (`master-blueprint.md` §4)

| Pilar | Narasi blueprint (ringkas) | Rulebook | Status | Rujukan implementasi / catatan |
|-------|-----------------------------|----------|--------|--------------------------------|
| **1 — Metacognition** | Jurnal refleksi; AI memantau konsistensi percaya diri vs hasil tes | Refleksi sebagai perilaku siswa tidak diwajibkan di rulebook inti | **Parsial** | `components/apex/modules/weekly-reflection.tsx`, `brain-dump.tsx`; kalibrasi lewat `app/api/assessment/learning-events/route.ts`, placement di `lib/assessment/placement-lifecycle.ts`. Pemantauan AI otomatis “confidence vs skor” belum sebagai fitur tunggal yang eksplisit. |
| **2 — Inquiry / Socrates** | AI tutor membimbing, tidak memberi jawaban langsung | Tidak mengatur detail tutor | **Parsial** | `app/api/chat/route.ts` (dan konteks Socrates di assessment); FAB / alur di `components/apex/apex-app.tsx`. Kualitas “tidak menjawab langsung” bergantung prompt & kebijakan konten. |
| **3 — Spaced repetition** | Jadwal ulang otomatis ke panel review | Rulebook §5.1 Hub = jadwal + evaluasi; SRS terpisah | **Parsial** | **Produk nyata:** `lib/learning/spaced-repetition-sm2.ts`, `app/api/learning/srs/queue/route.ts`, `app/api/learning/srs/review/route.ts`, `components/apex/modules/spaced-repetition.tsx`. **Gap UI:** `components/apex/modules/learning-hub.tsx` memakai `REVIEW_QUEUE` statis — bukan algoritma SRS. |
| **4 — Mastery learning** | Gerbang materi; ~80%; materi penunjang jika gagal | §4.2–4.3 PRE/POST, rantai lesson, threshold modul | **Selesai** (inti) / **Parsial** (remediasi) | `app/api/learning/lesson-assessment/route.ts`, `lib/learning/lesson-assessment.ts`, `components/apex/modules/learning-hub.tsx`, `app/api/learning/lesson-room/route.ts`, `app/learn/[moduleId]/[lessonId]/page.tsx`. Materi penunjang otomatis “beda konten” → cek `app/api/assessment/remediation` dan kurikulum; tidak selalu seluas narasi Finlandia. |
| **5 — Project-based learning** | Portofolio karya nyata semesteran | Di luar rulebook alur modul harian | **Parsial** | `components/apex/modules/portfolio.tsx`; kedalaman rubrik / wajib semester / unggah karya tergantung isi modul & kebijakan konten. |
| **6 — Bilingual academic output** | Proyek/esai dua bahasa | — | **Parsial** | Pola bilingual UI `t(id, en)` di seluruh `components/apex/**`. **Wajib** output akademik dua bahasa per tugas sebagai aturan platform belum dipetakan sebagai kontrak global. |
| **7 — Tafakkur & akhlak** | Muraja’ah, Niat Check, PBL worldview, mutaba’ah, radar orang tua | Mutaba’ah / spiritual sebagai dimensi kalibrasi (checklist) | **Parsial** | **Mutaba’ah + charity:** `app/api/learning/spiritual-habits/route.ts`, `lib/learning/spiritual-habits-catalog.ts`, Hub di `learning-hub.tsx`. **Belum:** Smart Muraja’ah/Tahfidz SRS + audio Qari; pop-up “Niat Check” sebelum modul; template PBL “Islamic + SDG” sebagai aturan engine. **Radar orang tua:** `components/apex/modules/parent-analytics.tsx` — verifikasi apakah spider chart + alert “akademik vs ibadah” sudah data-driven end-to-end. |

---

## 5. Fitur detail Pilar 7 (blueprint §4 baris 37–52)

| Fitur blueprint | Status | Catatan / rujukan |
|-----------------|--------|-------------------|
| Smart Muraja’ah Engine (Tahfidz + SRS + audio) | **Belum (v1)** | SRS akademik ada; konten Quran, hak audio, UX khusus belum. |
| Tafakkur Checkpoints (Niat / Bismillah / jurnal syukur) | **Belum (v1)** | Bisa dirancang sebagai modal + `learning-events` / tabel khusus; belum di Hub/lesson open. |
| Islamic worldview di PBL | **Parsial / konten** | Banyak di level desain tugas & metadata proyek, bukan satu flag di codebase. |
| Mutaba’ah Yaumiyyah + charity points | **Selesai** (inti) | `spiritual-habits` API + Hub; donasi fisik ke lembaga zakat = **Risiko / R&D** (kemitraan). |
| Dashboard radar spiritual (orang tua) + smart alert | **Parsial** | `parent-analytics.tsx`; definisi alert & sumber data perlu disejajarkan dengan blueprint. |

---

## 6. Standar global tambahan (`master-blueprint.md` §5)

| Bagian | Status | Catatan |
|--------|--------|---------|
| **5.1** Kolaborasi virtual & peer-review | **Belum (v1)** | Perlu produk, moderasi, privasi anak. |
| **5.2** Mock exam (TOEFL/IELTS/Checkpoint) & verifiable credentials (Credly) | **Belum (v1)** | Lisensi konten, antarmuka asli, integrasi badge = **Risiko / R&D**. |
| **5.3** Human-in-the-loop mentor | **Parsial** | `mentor-portal.tsx`, API mentor di `app/api/assessment/mentor-*`. |
| **5.4** Screen-time, WCAG, TTS, font disleksia | **Parsial** | `pomodoro-timer.tsx` mendukung ritme; pause paksa & aksesibilitas penuh perlu audit WCAG terpisah. |
| **5.5** Proyek berbasis SDG | **Parsial / konten** | Bisa lewat metadata proyek & panduan konten; bukan validator keras di semua lesson. |

---

## 7. User journey (`master-blueprint.md` §6)

| Langkah narasi | Status | Implementasi terdekat |
|----------------|--------|------------------------|
| Misi (quest) harian terstruktur | **Parsial** | Hub + modul terjadwal nyata; bagian “misi demo” / copy statis di `learning-hub.tsx` perlu dibedakan dari data API. |
| Eksplorasi & kolaborasi | **Parsial** | `ai-classroom.tsx` — cek apakah memenuhi narasi “ruang proyek virtual” atau perlu roadmap terpisah. |
| Latihan + AI tutor | **Parsial** | Lesson assessment + Socrates/chat. |
| Wellbeing break | **Parsial** | Pomodoro; belum “jeda layar otomatis 45 menit” seperti narasi. |
| Mock exam & badge global | **Belum (v1)** | Lihat §5.2. |

---

## 8. Keselarasan khusus: Rulebook §5.2 vs lesson room

- **Rulebook** (`LEARNING-FLOW-RULEBOOK-V1.md` §5.2): *Modul Materi* — materi unlocked dapat diakses ulang **tanpa** memaksa PRE untuk **review**.
- **Implementasi terkini:** akses **room materi** `/learn/...` dari Hub memerlukan **PRE selesai** (`lesson-room` API + tombol Materi). Jalur **Modul Materi (Ringkasan)** (`module-materials.tsx`) tetap relevan sebagai layar katalog/review terpisah.

**Tindakan dokumen:** jika keputusan produk tetap “PRE wajib untuk room dari Hub”, tambahkan amend eksplisit di rulebook (versi berikutnya) agar tidak kontradiktif dengan §5.2; atau pisahkan istilah “study room” vs “material review”.

---

## 9. Indeks file API learning (inti alur)

| Area | Path |
|------|------|
| Modul & jadwal | `app/api/learning/modules/route.ts`, `app/api/learning/student-schedule/route.ts` |
| Lesson PRE/POST | `app/api/learning/lesson-assessment/route.ts` |
| Room materi | `app/api/learning/lesson-room/route.ts` |
| Konfirmasi selesai modul | `app/api/learning/module-complete/route.ts` |
| SRS | `app/api/learning/srs/queue/route.ts`, `app/api/learning/srs/review/route.ts` |
| Mutaba’ah | `app/api/learning/spiritual-habits/route.ts` |

---

## 10. Rekomendasi pemakaian dokumen ini

1. **Sprint planning:** ambil hanya baris **Belum** / **Parsial** yang diprioritaskan produk; jangan menganggap seluruh white paper sebagai scope satu rilis.
2. **QA / UAT:** untuk fitur **Selesai**, uji terhadap **rulebook** + acceptance di `LEARNING-FLOW-IMPLEMENTATION-CHECKLIST-V1.md`.
3. **Komunikasi stakeholder:** jelaskan bahwa **blueprint** = visi; **rulebook** = kontrak rilis alur belajar; peta ini = jembatan keduanya.
4. **Revisi:** setelah perubahan besar (mis. menghapus demo Hub, menambah Muraja’ah), perbarui tabel §4–§7 dan tanggal di atas.

---

*Dokumen ini diturunkan dari `master-blueprint.md` dan diselaraskan dengan struktur repo `apex-frontend` pada tanggal pencatatan. Bukan pengganti legal, kurikulum resmi, atau kontrak klien.*
