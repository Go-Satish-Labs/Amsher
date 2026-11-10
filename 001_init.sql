create extension if not exists pgcrypto;

create table profiles (id uuid primary key references auth.users on delete cascade, display_name text, avatar_url text, created_at timestamptz default now());
create table books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 200), subtitle text, description text,
  book_type text not null default 'blank', cover_color text default '#1a1a1a', settings jsonb not null default '{}',
  is_favorite boolean not null default false, created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz);
create table sections (id uuid primary key default gen_random_uuid(), book_id uuid not null references books on delete cascade, title text not null, sort_order int not null default 0, created_at timestamptz default now());
create table pages (
  id uuid primary key default gen_random_uuid(), book_id uuid not null references books on delete cascade,
  section_id uuid references sections on delete set null, title text not null default 'Untitled',
  content_json jsonb not null default '{}', page_type text not null default 'document', sort_order int not null default 0,
  version int not null default 1, created_at timestamptz default now(), updated_at timestamptz default now());
create table page_versions (id uuid primary key default gen_random_uuid(), page_id uuid not null references pages on delete cascade, version_number int not null, content_json jsonb not null, created_at timestamptz default now());
create table media_assets (id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users on delete cascade, storage_path text not null, filename text, mime_type text, size_bytes bigint, metadata jsonb default '{}', created_at timestamptz default now());

create index on books(owner_id, updated_at desc); create index on sections(book_id, sort_order);
create index on pages(book_id, section_id, sort_order); create index on page_versions(page_id, version_number);
create index pages_fts on pages using gin (to_tsvector('english', title || ' ' || coalesce(content_json->>'text','')));

create function pages_before_update() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.content_json is distinct from old.content_json then
    if not exists (select 1 from page_versions where page_id=old.id and created_at > now() - interval '5 minutes') then
      insert into page_versions(page_id, version_number, content_json) values (old.id, old.version, old.content_json);
    end if;
  end if;
  new.version := old.version + 1; new.updated_at := now();
  update books set updated_at = now() where id = new.book_id;
  return new;
end $$;
create trigger pages_bu before update on pages for each row execute function pages_before_update();

create function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into profiles(id, display_name) values (new.id, split_part(new.email,'@',1)); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

alter table profiles enable row level security; alter table books enable row level security;
alter table sections enable row level security; alter table pages enable row level security;
alter table page_versions enable row level security; alter table media_assets enable row level security;

create policy own_profile on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy own_books on books for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_sections on sections for all using (exists (select 1 from books b where b.id=book_id and b.owner_id=auth.uid())) with check (exists (select 1 from books b where b.id=book_id and b.owner_id=auth.uid()));
create policy own_pages on pages for all using (exists (select 1 from books b where b.id=book_id and b.owner_id=auth.uid())) with check (exists (select 1 from books b where b.id=book_id and b.owner_id=auth.uid()));
create policy own_versions on page_versions for select using (exists (select 1 from pages p join books b on b.id=p.book_id where p.id=page_id and b.owner_id=auth.uid()));
create policy own_media on media_assets for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit) values ('media','media',false, 10485760) on conflict do nothing;
create policy media_rw on storage.objects for all to authenticated
  using (bucket_id='media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id='media' and (storage.foldername(name))[1] = auth.uid()::text);
