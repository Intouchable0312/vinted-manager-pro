CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.face_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  image_url text NOT NULL,
  descriptor jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text NOT NULL,
  amount numeric(12,2) NOT NULL,
  category text NOT NULL DEFAULT 'Divers',
  occurred_on date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.browsers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  url text NOT NULL,
  icon_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  title text NOT NULL,
  image_url text NOT NULL,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.face_photos TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.browsers TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO anon, authenticated;
GRANT ALL ON public.people TO service_role;
GRANT ALL ON public.face_photos TO service_role;
GRANT ALL ON public.transactions TO service_role;
GRANT ALL ON public.messages TO service_role;
GRANT ALL ON public.browsers TO service_role;
GRANT ALL ON public.products TO service_role;

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.browsers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app can manage people" ON public.people FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "app can manage face_photos" ON public.face_photos FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "app can manage transactions" ON public.transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "app can manage messages" ON public.messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "app can manage browsers" ON public.browsers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "app can manage products" ON public.products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.browsers;