-- ========================================================
-- Migration 00001: Enable pgvector & Create subjects table
-- Description: Activates vector extension and populates Egyptian curriculum subjects.
-- ========================================================

-- 1. Enable pgvector extension for AI Embeddings
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 2. Create subjects table
CREATE TABLE IF NOT EXISTS public.subjects (
    id SERIAL PRIMARY KEY,
    name_ar TEXT NOT NULL UNIQUE,
    name_en TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS on subjects (Public read-only)
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to subjects" 
    ON public.subjects FOR SELECT 
    USING (true);

-- 4. Insert the 6 Core Egyptian High School Subjects
INSERT INTO public.subjects (id, name_ar, name_en) VALUES
    (1, 'اللغة العربية', 'Arabic Language'),
    (2, 'اللغة الإنجليزية', 'English Language'),
    (3, 'الفيزياء', 'Physics'),
    (4, 'الكيمياء', 'Chemistry'),
    (5, 'الرياضة البحتة', 'Pure Mathematics'),
    (6, 'الرياضة التطبيقية', 'Applied Mathematics')
ON CONFLICT (id) DO UPDATE 
SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en;

-- Reset sequence to 7
SELECT setval('subjects_id_seq', 6, true);
