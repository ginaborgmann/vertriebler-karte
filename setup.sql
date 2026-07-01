create table if not exists vertriebler (
  id bigint generated always as identity primary key,
  name text not null,
  plz text not null,
  ort text,
  telefon text,
  email text,
  lat double precision,
  lon double precision,
  created_at timestamp with time zone default now()
);

alter table vertriebler enable row level security;

drop policy if exists "public read" on vertriebler;
drop policy if exists "public insert" on vertriebler;
drop policy if exists "public delete" on vertriebler;

create policy "public read" on vertriebler for select using (true);
create policy "public insert" on vertriebler for insert with check (true);
create policy "public delete" on vertriebler for delete using (true);
