ALTER TABLE public.browsers ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS browsers_person_id_idx ON public.browsers(person_id);