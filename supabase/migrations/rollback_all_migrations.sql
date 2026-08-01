-- ========================================================
-- Rollback / Down Migration Script
-- Description: Safely drops all created tables, functions, and indexes in reverse order.
-- ========================================================

-- Drop RLS policies & tables
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.student_weak_points CASCADE;
DROP TABLE IF EXISTS public.student_profiles CASCADE;
DROP TABLE IF EXISTS public.curriculum_chunks CASCADE;
DROP TABLE IF EXISTS public.subjects CASCADE;

-- Drop Functions & Triggers
DROP FUNCTION IF EXISTS public.match_curriculum_chunks(vector(1024), float, int, int);
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- Note: pgvector extension is kept (or drop if desired: DROP EXTENSION IF EXISTS vector;)
