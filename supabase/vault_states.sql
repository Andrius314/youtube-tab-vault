create table if not exists public.vault_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.vault_states enable row level security;

grant select, insert, update, delete on public.vault_states to authenticated;

drop policy if exists "vault_states_select_own" on public.vault_states;
drop policy if exists "vault_states_upsert_own" on public.vault_states;

create policy "vault_states_select_own"
on public.vault_states
for select
to authenticated
using (auth.uid() = user_id);

create policy "vault_states_upsert_own"
on public.vault_states
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.set_updated_at_vault_states()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_vault_states_updated_at on public.vault_states;
create trigger trg_vault_states_updated_at
before update on public.vault_states
for each row
execute function public.set_updated_at_vault_states();
