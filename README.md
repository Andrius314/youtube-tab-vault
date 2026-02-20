# YouTube Tab Vault

YouTube nuorodu valdymas su kategorijomis, planavimo datomis, perziuros statusu ir uzrasais.

## Paleidimas

1. Atidaryk `youtube-tab-vault/index.html`.
2. Pridek video nuorodas.
3. Jei reikia, atsidaryk video tame paciame puslapyje ir rasyk konspekta salia.

## Supabase Free DB (naudoti visur)

1. Susikurk Supabase projekta (free).
2. SQL Editor paleisk:

```sql
create table if not exists public.vault_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.vault_states enable row level security;

drop policy if exists "own_state_select" on public.vault_states;
drop policy if exists "own_state_upsert" on public.vault_states;

create policy "own_state_select"
on public.vault_states
for select
to authenticated
using (auth.uid() = user_id);

create policy "own_state_upsert"
on public.vault_states
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

3. App'e virsuje spausk `DB`, ivesk `Project URL` ir `Anon Key`.
4. Spausk `Login` ir prisijunk (arba susikurk paskyra).
5. Po prisijungimo duomenys sinchronizuojami i DB.
