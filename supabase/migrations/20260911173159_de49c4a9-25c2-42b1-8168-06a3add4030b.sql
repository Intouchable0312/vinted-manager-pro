CREATE POLICY "app can read faces" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id IN ('faces','media'));
CREATE POLICY "app can insert faces" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id IN ('faces','media'));
CREATE POLICY "app can update faces" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id IN ('faces','media')) WITH CHECK (bucket_id IN ('faces','media'));
CREATE POLICY "app can delete faces" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id IN ('faces','media'));