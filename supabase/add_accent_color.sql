-- À exécuter une fois si ta base existait avant l’ajout de accent_color
alter table public.profiles add column if not exists accent_color text;

alter table public.profiles drop constraint if exists profiles_accent_color_format;

alter table public.profiles
  add constraint profiles_accent_color_format check (
    accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'
  );
