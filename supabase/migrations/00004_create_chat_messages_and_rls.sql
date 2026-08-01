-- ========================================================
-- Migration 00004: Create chat_messages table with RLS
-- Description: Stores AI assistant chat messages per student with full isolation.
-- ========================================================

-- 1. Create chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject_id INT REFERENCES public.subjects(id) ON DELETE SET NULL,
    mode TEXT DEFAULT 'advisor', -- 'advisor' | 'step' | 'hint' | 'final' | 'visual' | 'exam'
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create index for fast chat history querying per student & subject
CREATE INDEX IF NOT EXISTS idx_chat_messages_student ON public.chat_messages(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_subject ON public.chat_messages(student_id, subject_id);

-- ========================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ========================================================

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies for chat_messages
CREATE POLICY "Users can view own chat messages" 
    ON public.chat_messages FOR SELECT 
    USING (auth.uid() = student_id);

CREATE POLICY "Users can insert own chat messages" 
    ON public.chat_messages FOR INSERT 
    WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Users can update own chat messages" 
    ON public.chat_messages FOR UPDATE 
    USING (auth.uid() = student_id);

CREATE POLICY "Users can delete own chat messages" 
    ON public.chat_messages FOR DELETE 
    USING (auth.uid() = student_id);
