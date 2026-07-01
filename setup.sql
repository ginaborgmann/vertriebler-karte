-- In Supabase im SQL Editor ausführen.
create table if not exists public.sales_people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  zip text not null,
  city text,
  lat double precision not null,
  lon double precision not null,
  created_at timestamptz not null default now()
);

alter table public.sales_people enable row level security;

-- Öffentlich lesbar, damit alle über den Link dieselben Vertriebler sehen.
create policy "sales_people_select_public"
  on public.sales_people for select
  using (true);

-- Öffentlich einfügbar, damit Vertriebler über die Website angelegt werden können.
create policy "sales_people_insert_public"
  on public.sales_people for insert
  with check (true);

-- Öffentlich löschbar, damit der Löschen-Button funktioniert.
-- Für produktive Nutzung besser durch Login/Admin ersetzen.
create policy "sales_people_delete_public"
  on public.sales_people for delete
  using (true);
