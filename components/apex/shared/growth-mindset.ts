type TranslateFn = (id: string, en: string) => string

type GrowthMindsetTone = 'dashboard' | 'profile'

function getDayKeyUTC() {
  const today = new Date()
  return today.getUTCFullYear() * 10000 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate()
}

export function getDailyGrowthMindsetMessage(
  t: TranslateFn,
  tone: GrowthMindsetTone,
  seedInput?: string,
) {
  const options =
    tone === 'dashboard'
      ? [
          t(
            'Kemampuanmu tumbuh setiap kali kamu berlatih. Mulai dari langkah kecil.',
            'Your ability grows every time you practice. Start with one small step.',
          ),
          t(
            'Belum bisa bukan berarti tidak bisa. Coba lagi dengan strategi baru.',
            'Not yet is not never. Try again with a better strategy.',
          ),
          t(
            'Tantangan itu latihan otakmu. Tetap proses, hasil akan mengikuti.',
            'Challenges train your brain. Trust the process, results will follow.',
          ),
          t(
            'Konsistensi kecil setiap hari menghasilkan lompatan besar.',
            'Small daily consistency creates big leaps.',
          ),
        ]
      : [
          t(
            'Growth mindset: kemampuanmu terus bertumbuh setiap kali kamu berlatih, mencoba, dan belajar dari kesalahan.',
            'Growth mindset: your abilities grow every time you practice, try again, and learn from mistakes.',
          ),
          t(
            'Growth mindset: tantangan adalah latihan untuk otakmu. Teruskan prosesnya, hasil akan mengikuti.',
            'Growth mindset: challenges are training for your brain. Keep the process, results will follow.',
          ),
          t(
            'Growth mindset: belum bisa bukan berarti tidak bisa. Dengan strategi dan ketekunan, kamu akan meningkat.',
            'Growth mindset: not yet is not never. With strategy and persistence, you will improve.',
          ),
          t(
            'Growth mindset: setiap usaha kecil hari ini menumpuk menjadi lompatan besar di masa depan.',
            'Growth mindset: each small effort today compounds into big progress tomorrow.',
          ),
        ]

  const baseSeed = String(seedInput ?? '')
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const seed = baseSeed + getDayKeyUTC()
  return options[Math.abs(seed) % options.length] ?? options[0]
}

