create table if not exists vertriebler (
  id bigint generated always as identity primary key,
  name text not null,
  plz text not null,
  lat double precision not null,
  lon double precision not null,
  created_at timestamptz default now()
);

alter table vertriebler enable row level security;

drop policy if exists "Jeder darf lesen" on vertriebler;
drop policy if exists "Jeder darf einfügen" on vertriebler;
drop policy if exists "Jeder darf löschen" on vertriebler;

create policy "Jeder darf lesen" on vertriebler for select using (true);
create policy "Jeder darf einfügen" on vertriebler for insert with check (true);
create policy "Jeder darf löschen" on vertriebler for delete using (true);
