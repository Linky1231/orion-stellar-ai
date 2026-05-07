
-- Conversations
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Nueva conversación',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.conversations (device_id, updated_at DESC);

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL DEFAULT '',
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.messages (conversation_id, created_at);

-- Notes
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Nota',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.notes (device_id, updated_at DESC);

-- Orion global config (singleton)
CREATE TABLE public.orion_config (
  id INT PRIMARY KEY DEFAULT 1,
  personality TEXT NOT NULL DEFAULT 'Carismático, cálido, profesional, con humor sutil. Experto en desarrollo de videojuegos: programación, arte y diseño de niveles. Habla en español por defecto.',
  behavior TEXT NOT NULL DEFAULT 'Responde de forma clara y directa. Usa markdown cuando ayude. Cuando se generen imágenes, sigue las instrucciones del usuario al pie de la letra.',
  context TEXT NOT NULL DEFAULT 'Eres Orión Estellar, un asistente bot con personalidad propia. Combinas el carisma de la versión Builda con la potencia de la versión web.',
  extra_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);
INSERT INTO public.orion_config (id) VALUES (1);

-- Orion knowledge base
CREATE TABLE public.orion_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orion reference images
CREATE TABLE public.orion_reference_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS, permissive policies (no auth, device-scoped via app)
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_reference_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all_conv" ON public.conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "all_msg" ON public.messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "all_notes" ON public.notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "read_cfg" ON public.orion_config FOR SELECT USING (true);
CREATE POLICY "write_cfg" ON public.orion_config FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "read_kb" ON public.orion_knowledge FOR SELECT USING (true);
CREATE POLICY "write_kb" ON public.orion_knowledge FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "read_ref" ON public.orion_reference_images FOR SELECT USING (true);
CREATE POLICY "write_ref" ON public.orion_reference_images FOR ALL USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orion_config;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orion_knowledge;

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments','chat-attachments', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('orion-references','orion-references', true);

CREATE POLICY "public read chat" ON storage.objects FOR SELECT USING (bucket_id = 'chat-attachments');
CREATE POLICY "public write chat" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-attachments');
CREATE POLICY "public read ref" ON storage.objects FOR SELECT USING (bucket_id = 'orion-references');
CREATE POLICY "public write ref" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'orion-references');
CREATE POLICY "public delete ref" ON storage.objects FOR DELETE USING (bucket_id = 'orion-references');
