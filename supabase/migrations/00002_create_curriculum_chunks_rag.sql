-- ========================================================
-- Migration 00002: Create curriculum_chunks table & Vector Index
-- Description: Stores RAG chunks with 1024-dim embeddings & similarity search function.
-- ========================================================

-- 1. Create curriculum_chunks table
CREATE TABLE IF NOT EXISTS public.curriculum_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id INT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    unit_title TEXT NOT NULL,
    lesson_title TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1024), -- 1024 dimensions for modern embeddings (Gemini 1.5 / OpenAI text-embedding-3)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create HNSW Vector Index for ultra-fast Similarity Search
CREATE INDEX IF NOT EXISTS idx_curriculum_chunks_embedding 
ON public.curriculum_chunks 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 3. Create index for filtering by subject & lesson
CREATE INDEX IF NOT EXISTS idx_curriculum_chunks_subject_id ON public.curriculum_chunks(subject_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_chunks_lesson ON public.curriculum_chunks(subject_id, lesson_title);

-- 4. Enable RLS (Public read-only for chunks)
ALTER TABLE public.curriculum_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to curriculum chunks" 
    ON public.curriculum_chunks FOR SELECT 
    USING (true);

-- 5. RPC Function for RAG Vector Cosine Similarity Search
CREATE OR REPLACE FUNCTION match_curriculum_chunks (
  query_embedding vector(1024),
  match_threshold float,
  match_count int,
  filter_subject_id int DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  subject_id INT,
  unit_title TEXT,
  lesson_title TEXT,
  content TEXT,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.subject_id,
    c.unit_title,
    c.lesson_title,
    c.content,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.curriculum_chunks c
  WHERE 1 - (c.embedding <=> query_embedding) > match_threshold
    AND (filter_subject_id IS NULL OR c.subject_id = filter_subject_id)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
