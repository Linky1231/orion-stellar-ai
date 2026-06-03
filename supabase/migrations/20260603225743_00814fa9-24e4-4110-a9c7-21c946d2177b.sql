CREATE TABLE public.orion_builda_scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orion_builda_scripts TO anon, authenticated;
GRANT ALL ON public.orion_builda_scripts TO service_role;

ALTER TABLE public.orion_builda_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read builda scripts" ON public.orion_builda_scripts FOR SELECT USING (true);
CREATE POLICY "Public write builda scripts" ON public.orion_builda_scripts FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_orion_builda_scripts_updated_at
BEFORE UPDATE ON public.orion_builda_scripts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();