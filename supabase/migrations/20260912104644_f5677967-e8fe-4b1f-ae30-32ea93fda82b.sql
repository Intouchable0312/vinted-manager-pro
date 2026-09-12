CREATE TABLE public.mailboxes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  person_id uuid REFERENCES public.people(id) ON DELETE CASCADE,
  label text,
  address text NOT NULL UNIQUE,
  password text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mailboxes_person_id_idx ON public.mailboxes(person_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mailboxes TO anon, authenticated;
GRANT ALL ON public.mailboxes TO service_role;
ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mailboxes_all" ON public.mailboxes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);