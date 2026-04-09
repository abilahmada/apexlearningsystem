-- Contoh konten Lapis 1 (skenario karakter + item bank CAT) untuk pengembangan / demo.
-- Aman dijalankan ulang: ON CONFLICT pada slug.

INSERT INTO public.intake_scenario_prompts (id, slug, dimension_hint, scenario_text, response_mode, options, sort_order)
VALUES
  (
    uuid_generate_v4(),
    'pr-matematika-dan-ulangan-bi',
    'karakter',
    'Kamu punya PR matematika yang sulit. Besok ada ulangan Bahasa Inggris. Kamu punya 2 jam waktu fokus di rumah. Apa yang paling mungkin kamu lakukan terlebih dulu?',
    'MULTIPLE_CHOICE',
    '[
      {"id": "a", "label": "Selesaikan PR matematika dulu sampai tuntas"},
      {"id": "b", "label": "Review materi ulangan BI dulu supaya siap besok"},
      {"id": "c", "label": "Bagi waktu: sebagian matematika, sebagian BI"},
      {"id": "d", "label": "Istirahat dulu, baru mulai yang paling mudah"}
    ]'::jsonb,
    10
  ),
  (
    uuid_generate_v4(),
    'baseline-motivasi-belajar-ringkas',
    'spiritual',
    'Dalam 2–3 kalimat: apa yang paling membuatmu termotivasi belajar hari ini? (bukan jawaban benar/salah — hanya mengenal kamu.)',
    'OPEN_SHORT',
    NULL,
    20
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.intake_item_bank (
  id, slug, dimension, subject, item_type, difficulty_logit, stem, options, scoring_rubric, concept_tags, active
)
VALUES
  (
    uuid_generate_v4(),
    'sample-cat-operasi-pecahan',
    'kognitif',
    'Matematika',
    'MULTIPLE_CHOICE',
    0.0,
    'Berapa hasil dari 3/4 + 1/2?',
    '[
      {"id": "a", "label": "4/6"},
      {"id": "b", "label": "5/4"},
      {"id": "c", "label": "4/8"},
      {"id": "d", "label": "1"}
    ]'::jsonb,
    '{"correctOptionId": "b", "points": 1}'::jsonb,
    ARRAY['pecahan', 'aritmatika']::text[],
    TRUE
  ),
  (
    uuid_generate_v4(),
    'sample-open-penalaran-teks',
    'bahasa',
    'Bahasa Indonesia',
    'OPEN_SHORT',
    0.0,
    'Bacalah kalimat berikut: "Meskipun hujan deras, tim tetap melanjutkan latihan." Apa hubungan antara bagian awal dan akhir kalimat? Jawab dalam 2–3 kalimat.',
    NULL,
    '{"maxPoints": 2, "rubric": "Kohesi kausal / kontras"}'::jsonb,
    ARRAY['kohesi', 'inferensi']::text[],
    TRUE
  ),
  (
    uuid_generate_v4(),
    'sample-digital-logika-sederhana',
    'digital',
    'Computational thinking',
    'MULTIPLE_CHOICE',
    -0.2,
    'Jika semua kucing adalah mamalia, dan Milo adalah kucing, maka:',
    '[
      {"id": "a", "label": "Milo pasti mamalia"},
      {"id": "b", "label": "Milo mungkin bukan mamalia"},
      {"id": "c", "label": "Semua mamalia adalah kucing"},
      {"id": "d", "label": "Tidak bisa disimpulkan"}
    ]'::jsonb,
    '{"correctOptionId": "a", "points": 1}'::jsonb,
    ARRAY['logika', 'silogisme']::text[],
    TRUE
  )
ON CONFLICT (slug) DO NOTHING;
