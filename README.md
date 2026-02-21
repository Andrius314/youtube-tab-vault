# YouTube Tab Vault

YouTube nuorodu valdymas su kategorijomis, perziuros data, statusu ir uzrasais.

## Paleidimas

1. Atidaryk `youtube-tab-vault/index.html` arba GitHub Pages versija.
2. Pridek video nuorodas.
3. Video gali ziureti tame paciame puslapyje ir rasyti uzrasus salia.

## Supabase (automatiskai prijungta)

- App jau turi sukonfiguruota:
  - `Project URL`: `https://aykytcqihvxwhvywedpm.supabase.co`
  - `Publishable key`: `sb_publishable_jFa2Ri2_-7GWB37l9DFeMg_2wm7qWY4`
- Lenteles ir RLS jau sukurtos (`vault_states`).
- Prisijungimas vyksta automatiskai per `Anonymous Auth` (be Google).

Jei virsuje matai, kad neprisijungia:
1. Supabase Dashboard atsidaryk `Authentication -> Providers`.
2. Ijunk `Anonymous Sign-Ins`.
3. Puslapyje paspausk `Reconnect`.

## Manualus override (jei keisi projekta)

1. Paspausk virsuje `DB`.
2. Ivesk savo `Project URL` ir `Publishable/Anon key`.
3. App issaugos config localiai ir persijungs.

## SQL

Naudota migracija yra faile `supabase/vault_states.sql`.
