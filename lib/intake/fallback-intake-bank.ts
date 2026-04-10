import type { CalibrationDimension } from "@/lib/calibration/engine";
import { CALIBRATION_DIMENSIONS } from "@/lib/calibration/engine";

export type IntakeBankItemJson = {
  id: string;
  slug: string;
  dimension: CalibrationDimension;
  subject: string;
  item_type: "MULTIPLE_CHOICE";
  stem: string;
  options: Array<{ id: string; label: string }>;
  scoring_rubric: { correctOptionId: string; points: number };
  difficulty_logit: number;
};

type ItemSeed = {
  subject: string;
  stem: string;
  correct: string;
  wrong: [string, string, string];
  difficulty_logit: number;
};

/** 5 soal per dimensi — berbeda topik dan kesulitan, cocok untuk semua jenjang. */
const ITEM_SEEDS: Record<CalibrationDimension, ItemSeed[]> = {
  kognitif: [
    {
      subject: "Operasi dasar",
      stem: "Jika ada 8 mangga dan 3 dimakan, lalu mendapat 5 lagi, berapa jumlah mangga sekarang?",
      correct: "10",
      wrong: ["8", "11", "6"],
      difficulty_logit: -1.0,
    },
    {
      subject: "Pola angka",
      stem: "Lanjutkan pola: 2, 4, 8, 16, …",
      correct: "32",
      wrong: ["18", "20", "24"],
      difficulty_logit: -0.4,
    },
    {
      subject: "Silogisme",
      stem: "Semua siswa rajin belajar. Budi adalah siswa. Kesimpulan yang benar adalah…",
      correct: "Budi rajin belajar",
      wrong: ["Budi tidak suka sekolah", "Tidak semua siswa rajin", "Budi bukan siswa"],
      difficulty_logit: 0.1,
    },
    {
      subject: "Perbandingan",
      stem: "Harga buku Rp12.000, pensil Rp3.000, penggaris Rp5.000. Selisih harga buku dan total alat tulis lainnya adalah…",
      correct: "Rp4.000",
      wrong: ["Rp8.000", "Rp7.000", "Rp9.000"],
      difficulty_logit: 0.6,
    },
    {
      subject: "Penalaran logis",
      stem: "Toko mendapat 150 buku, menjual 65, lalu mendapat 30 lagi, kemudian menjual 40. Sisa buku sekarang adalah…",
      correct: "75",
      wrong: ["80", "70", "85"],
      difficulty_logit: 1.2,
    },
  ],

  bahasa: [
    {
      subject: "Kosakata dasar",
      stem: "Sinonim kata 'gembira' adalah…",
      correct: "Bahagia",
      wrong: ["Sedih", "Marah", "Takut"],
      difficulty_logit: -1.0,
    },
    {
      subject: "Kesopanan berbahasa",
      stem: "Pilih kalimat yang paling sopan untuk meminta bantuan guru:",
      correct: "Permisi Bu, boleh saya bertanya sebentar?",
      wrong: ["Hei, jawab ini!", "Guru, cepat ke sini!", "Saya tidak paham, kamu jelaskan!"],
      difficulty_logit: -0.4,
    },
    {
      subject: "Tata bahasa",
      stem: "Pilih kalimat yang menggunakan tanda baca dengan benar:",
      correct: "Ibu pergi ke pasar, sedangkan Ayah bekerja di kantor.",
      wrong: ["Ibu pergi ke pasar sedangkan, ayah bekerja di kantor.", "Ibu pergi ke pasar; sedangkan Ayah bekerja di kantor?", "Ibu pergi ke pasar. Sedangkan ayah bekerja di kantor,"],
      difficulty_logit: 0.1,
    },
    {
      subject: "Pemahaman bacaan",
      stem: "Dalam bacaan: 'Lingkungan yang bersih mencerminkan budaya masyarakatnya.' Makna kalimat tersebut adalah…",
      correct: "Kebersihan lingkungan menunjukkan kebiasaan warga setempat",
      wrong: ["Kebersihan hanya tanggung jawab pemerintah", "Masyarakat tidak peduli lingkungan", "Lingkungan kotor adalah hal biasa"],
      difficulty_logit: 0.6,
    },
    {
      subject: "Antonim & nuansa",
      stem: "Antonim yang paling tepat untuk kata 'gigih' dalam konteks belajar adalah…",
      correct: "Mudah menyerah",
      wrong: ["Rajin", "Semangat", "Tekun"],
      difficulty_logit: 1.2,
    },
  ],

  digital: [
    {
      subject: "Dasar komputer",
      stem: "Tempat menyimpan kumpulan file di komputer disebut…",
      correct: "Folder",
      wrong: ["Monitor", "Keyboard", "Speaker"],
      difficulty_logit: -1.0,
    },
    {
      subject: "Keamanan kata sandi",
      stem: "Kata sandi yang paling aman adalah…",
      correct: "Kombinasi huruf besar, kecil, angka, dan simbol (minimal 12 karakter)",
      wrong: ["Nama lengkap dan tanggal lahir", "Angka 123456", "Nama hewan peliharaan"],
      difficulty_logit: -0.4,
    },
    {
      subject: "Etika digital",
      stem: "Kamu menerima pesan dari orang tidak dikenal yang meminta password akun sekolahmu. Yang harus kamu lakukan adalah…",
      correct: "Abaikan dan laporkan ke guru atau orang tua",
      wrong: ["Bagikan passwordnya agar masalah selesai", "Kirim setengah password saja", "Blokir saja tanpa memberitahu siapapun"],
      difficulty_logit: 0.1,
    },
    {
      subject: "Algoritma dasar",
      stem: "Urutan langkah yang benar untuk menyeduh teh adalah…",
      correct: "Rebus air → siapkan gelas → tuang air panas → masukkan teh → aduk",
      wrong: ["Masukkan teh → rebus air → siapkan gelas → aduk → tuang", "Siapkan gelas → masukkan teh → rebus air → aduk → tuang", "Aduk → tuang air → rebus air → masukkan teh → siapkan gelas"],
      difficulty_logit: 0.6,
    },
    {
      subject: "Berpikir komputasional",
      stem: "Sebuah program memiliki aturan: 'Jika nilai ≥ 75, cetak LULUS; selain itu cetak TIDAK LULUS.' Nilai 74 akan menghasilkan output…",
      correct: "TIDAK LULUS",
      wrong: ["LULUS", "ERROR", "Tidak ada output"],
      difficulty_logit: 1.2,
    },
  ],

  karakter: [
    {
      subject: "Respons terhadap kesulitan",
      stem: "Ketika kamu tidak mengerti pelajaran, tindakan terbaik adalah…",
      correct: "Bertanya kepada guru atau teman, lalu belajar kembali",
      wrong: ["Pura-pura mengerti saja", "Menyalin pekerjaan teman", "Melewatkan topik tersebut"],
      difficulty_logit: -1.0,
    },
    {
      subject: "Tanggung jawab",
      stem: "Kamu lupa mengerjakan PR. Sikap yang paling bertanggung jawab adalah…",
      correct: "Jujur kepada guru dan meminta kesempatan menyelesaikannya",
      wrong: ["Berbohong bahwa buku catatan tertinggal di rumah", "Menyalin PR teman saat di kelas", "Diam saja dan berharap guru tidak mengecek"],
      difficulty_logit: -0.4,
    },
    {
      subject: "Menghadapi kegagalan",
      stem: "Saat gagal mengerjakan soal ulangan, sikap terbaik adalah…",
      correct: "Mencari tahu kesalahan, belajar lebih giat, dan mencoba lagi",
      wrong: ["Menyerah dan tidak belajar topik itu lagi", "Menyalahkan soal yang terlalu sulit", "Mencontek teman agar nilai baik"],
      difficulty_logit: 0.1,
    },
    {
      subject: "Kejujuran akademik",
      stem: "Saat ujian, kamu mengetahui jawaban dari teman. Sikap yang paling tepat adalah…",
      correct: "Tetap mengerjakan sendiri dan percaya pada kemampuan diri",
      wrong: ["Mengambil semua jawabannya karena hasilnya sama saja", "Mengambil satu dua jawaban yang tidak yakin saja", "Memberitahu guru bahwa teman menawarkan jawaban"],
      difficulty_logit: 0.6,
    },
    {
      subject: "Ketekunan jangka panjang",
      stem: "Kamu sudah belajar keras selama sebulan tapi nilai masih belum memuaskan. Sikap paling tepat adalah…",
      correct: "Evaluasi cara belajar, minta bimbingan, dan terus berusaha dengan strategi baru",
      wrong: ["Berhenti mencoba karena tidak berbakat", "Hanya belajar saat dekat ujian saja", "Menyalahkan guru yang tidak mengajar dengan baik"],
      difficulty_logit: 1.2,
    },
  ],

  spiritual: [
    {
      subject: "Niat belajar",
      stem: "Belajar dengan sungguh-sungguh merupakan bentuk…",
      correct: "Rasa syukur dan menghargai kesempatan yang diberikan",
      wrong: ["Kewajiban yang terpaksa dilakukan", "Cara mencari perhatian orang tua", "Rutinitas tanpa makna"],
      difficulty_logit: -1.0,
    },
    {
      subject: "Disiplin waktu",
      stem: "Datang ke sekolah tepat waktu setiap hari mencerminkan nilai…",
      correct: "Disiplin dan menghargai waktu orang lain",
      wrong: ["Ketakutan dihukum guru", "Kebiasaan tanpa makna", "Kepentingan diri sendiri saja"],
      difficulty_logit: -0.4,
    },
    {
      subject: "Integritas",
      stem: "Belajar dengan niat baik dan disiplin setiap hari adalah bentuk…",
      correct: "Menghargai ilmu, waktu, dan kepercayaan yang diberikan",
      wrong: ["Menghindari tanggung jawab lain", "Cara mencari nilai bagus saja", "Kebiasaan yang tidak perlu diteruskan"],
      difficulty_logit: 0.1,
    },
    {
      subject: "Kejujuran",
      stem: "Mencontek saat ujian bertentangan dengan nilai…",
      correct: "Kejujuran, integritas, dan rasa percaya diri",
      wrong: ["Kecerdasan akademik", "Kemampuan bersosialisasi", "Kreativitas belajar"],
      difficulty_logit: 0.6,
    },
    {
      subject: "Motivasi intrinsik",
      stem: "Cara paling bermakna menunjukkan semangat belajar adalah…",
      correct: "Belajar konsisten bukan hanya saat ujian, mencari pemahaman bukan sekadar nilai",
      wrong: ["Belajar hanya ketika ada hadiah atau ancaman hukuman", "Menampilkan semangat di depan guru saja", "Mengerjakan tugas minimum agar lolos"],
      difficulty_logit: 1.2,
    },
  ],

  leadership: [
    {
      subject: "Kerja tim dasar",
      stem: "Dalam kerja kelompok, semua anggota seharusnya…",
      correct: "Ikut berkontribusi sesuai kemampuan masing-masing",
      wrong: ["Membiarkan yang pintar mengerjakan semua", "Menunggu perintah saja", "Hanya menulis nama di laporan akhir"],
      difficulty_logit: -1.0,
    },
    {
      subject: "Resolusi perbedaan",
      stem: "Saat ada perbedaan pendapat di kelompok, yang terbaik adalah…",
      correct: "Mendengarkan semua pendapat dan mencari solusi bersama",
      wrong: ["Memaksakan pendapat sendiri karena paling pintar", "Diam dan membiarkan orang lain memutuskan", "Keluar dari kelompok karena tidak sepakat"],
      difficulty_logit: -0.4,
    },
    {
      subject: "Peran dalam tim",
      stem: "Dalam kelompok, peran yang paling membantu keberhasilan tim adalah…",
      correct: "Mendengarkan ide teman, mendorong partisipasi, dan menyepakati langkah bersama",
      wrong: ["Mengerjakan semua tugas sendiri agar lebih cepat", "Memaksakan pendapat sendiri selalu", "Menghindari diskusi agar tidak konflik"],
      difficulty_logit: 0.1,
    },
    {
      subject: "Kepemimpinan situasional",
      stem: "Seorang pemimpin kelompok yang baik akan…",
      correct: "Mendelegasikan tugas sesuai kekuatan anggota dan mendengarkan masukan",
      wrong: ["Mengambil semua keputusan sendiri tanpa diskusi", "Hanya memerintah tanpa ikut mengerjakan", "Selalu mengalah pada semua pendapat agar tidak ada konflik"],
      difficulty_logit: 0.6,
    },
    {
      subject: "Manajemen anggota bermasalah",
      stem: "Sebagai ketua kelompok, ada anggota yang tidak berkontribusi. Langkah paling efektif adalah…",
      correct: "Berbicara baik-baik, mencari tahu hambatannya, dan membantu menemukan peran yang cocok",
      wrong: ["Langsung melaporkan ke guru tanpa bicara terlebih dahulu", "Mengerjakan bagiannya sendiri dan tidak memberi tahu siapapun", "Mengeluarkannya dari kelompok karena menghambat"],
      difficulty_logit: 1.2,
    },
  ],
};

function buildItem(dim: CalibrationDimension, seed: ItemSeed, idx: number): IntakeBankItemJson {
  const opts = [
    { id: "A", label: seed.correct },
    { id: "B", label: seed.wrong[0] },
    { id: "C", label: seed.wrong[1] },
    { id: "D", label: seed.wrong[2] },
  ];
  return {
    id: `fb-${dim}-${idx}`,
    slug: `fallback-${dim}-${idx}`,
    dimension: dim,
    subject: seed.subject,
    item_type: "MULTIPLE_CHOICE",
    stem: seed.stem,
    options: opts,
    scoring_rubric: { correctOptionId: "A", points: 1 },
    difficulty_logit: seed.difficulty_logit,
  };
}

/** 30 soal fallback: 5 per dimensi, tersebar difficulty −1.0 → 1.2. */
export function buildFallbackIntakeBank(): IntakeBankItemJson[] {
  const out: IntakeBankItemJson[] = [];
  for (const dim of CALIBRATION_DIMENSIONS) {
    const seeds = ITEM_SEEDS[dim];
    seeds.forEach((seed, i) => out.push(buildItem(dim, seed, i + 1)));
  }
  return out;
}
