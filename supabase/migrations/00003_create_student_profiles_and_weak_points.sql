-- ========================================================
-- Migration 00003: Create student_profiles & student_weak_points with RLS
-- Description: Stores student preferences, weak points, and enforces strict RLS per user.
-- ========================================================

-- 1. Create student_profiles table
CREATE TABLE IF NOT EXISTS public.student_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    preferred_mode TEXT DEFAULT 'step',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create student_weak_points table
CREATE TABLE IF NOT EXISTS public.student_weak_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject_id INT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    lesson_title TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Trigger to auto-update updated_at on student_profiles
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_student_profiles_updated_at
BEFORE UPDATE ON public.student_profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ========================================================

-- Enable RLS
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_weak_points ENABLE ROW LEVEL SECURITY;

-- Policies for student_profiles
CREATE POLICY "Users can view own profile" 
    ON public.student_profiles FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" 
    ON public.student_profiles FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" 
    ON public.student_profiles FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own profile" 
    ON public.student_profiles FOR DELETE 
    USING (auth.uid() = user_id);

-- Policies for student_weak_points
CREATE POLICY "Users can view own weak points" 
    ON public.student_weak_points FOR SELECT 
    USING (auth.uid() = student_id);

CREATE POLICY "Users can insert own weak points" 
    ON public.student_weak_points FOR INSERT 
    WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Users can update own weak points" 
    ON public.student_weak_points FOR UPDATE 
    USING (auth.uid() = student_id);

CREATE POLICY "Users can delete own weak points" 
    ON public.student_weak_points FOR DELETE 
    USING (auth.uid() = student_id);
