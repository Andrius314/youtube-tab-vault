# YouTube Tab Vault

YouTube nuorodu valdymas su kategorijomis, planavimo datomis, perziuros statusu ir uzrasais.

## Paleidimas

1. Atidaryk `youtube-tab-vault/index.html`.
2. Pridek video nuorodas.
3. Jei reikia, atsidaryk video tame paciame puslapyje ir rasyk konspekta salia.

## Supabase Free DB (naudoti visur)

1. Susikurk Supabase projekta (free).
2. `Authentication -> Providers -> Google` ijunk Google provider.
3. Google Cloud Console susikurk OAuth Client ir i Authorized redirect URI butinai pridiek:
   - `https://<TAVO_PROJECT_REF>.supabase.co/auth/v1/callback`
4. `Authentication -> URL Configuration` i `Redirect URLs` pridiek:
   - `https://andrius314.github.io/youtube-tab-vault/`
   - (pasirinktinai testui) `https://andrius314.github.io/bandymas3/youtube-tab-vault/`
5. SQL Editor paleisk:

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

6. App'e virsuje spausk `DB`, ivesk `Project URL` ir `Anon Key`.
7. Spausk `Google` ir prisijunk vienu paspaudimu.
8. Po prisijungimo duomenys sinchronizuojami i DB.
