# Digital Library & Research Workspace — v0.1
1. Create a project at supabase.com. SQL Editor → open and run [`001_init.sql`](./001_init.sql).
2. Auth → URL Configuration: add your dev/prod URL (e.g. http://localhost:5173) as a redirect.
3. Copy `.env.example` to `.env` and paste the Project URL + **publishable/anon** key (never the service-role key).
4. `npm install && npm run dev`

Security: RLS is enabled on every table; the `media` bucket is private and scoped to `<user_id>/…` paths.
GitHub Pages: uses HashRouter, so no SPA fallback is needed; set `VITE_BASE_PATH=/repo-name/` when building.
