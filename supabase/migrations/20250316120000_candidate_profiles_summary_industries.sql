-- Align candidate_profiles with app usage (reads/writes summary + industries).
-- Run in Supabase SQL editor or via `supabase db push` if you use the CLI.

alter table public.candidate_profiles
  add column if not exists summary text;

alter table public.candidate_profiles
  add column if not exists industries text;

comment on column public.candidate_profiles.summary is
  'Professional summary; optional, synced from onboarding / CV parse.';

comment on column public.candidate_profiles.industries is
  'Comma-separated or free-text industries; optional.';
