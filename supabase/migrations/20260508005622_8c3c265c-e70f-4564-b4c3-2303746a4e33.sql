
-- Memoria personal del usuario (por dispositivo)
CREATE TABLE public.user_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  content TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'fact',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_memory_device ON public.user_memory(device_id, created_at DESC);
ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_user_memory ON public.user_memory FOR ALL USING (true) WITH CHECK (true);

-- Carpetas de notas
CREATE TABLE public.note_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Nueva carpeta',
  section TEXT NOT NULL DEFAULT 'main', -- main | dev
  status TEXT NOT NULL DEFAULT 'development', -- stable | development | problematic | abandoned
  color TEXT NOT NULL DEFAULT '#60a5fa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_note_folders_device ON public.note_folders(device_id);
ALTER TABLE public.note_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_note_folders ON public.note_folders FOR ALL USING (true) WITH CHECK (true);

-- Ampliar notes
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.note_folders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'development',
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_notes_folder ON public.notes(folder_id);
CREATE INDEX IF NOT EXISTS idx_notes_device_section ON public.notes(device_id, section);
