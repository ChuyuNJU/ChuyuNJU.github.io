-- Achievements archive for ChuyuNJU.github.io
-- Run this file once in the Supabase SQL Editor as the project owner.

begin;

create extension if not exists pgcrypto;

create table if not exists public.achievement_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.achievement_records (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('award', 'patent', 'software_copyright')),
  title text not null check (char_length(title) between 1 and 500),
  year smallint not null check (year between 1900 and 2200),
  status text check (status is null or char_length(status) <= 100),

  awarding_body text check (awarding_body is null or char_length(awarding_body) <= 300),
  award_level text check (award_level is null or char_length(award_level) <= 100),
  award_grade text check (award_grade is null or char_length(award_grade) <= 100),
  award_rank text check (award_rank is null or char_length(award_rank) <= 100),
  certificate_no text check (certificate_no is null or char_length(certificate_no) <= 200),
  award_date date,
  award_recipients text check (award_recipients is null or char_length(award_recipients) <= 1000),

  patent_type text check (patent_type is null or char_length(patent_type) <= 100),
  patent_application_no text check (patent_application_no is null or char_length(patent_application_no) <= 200),
  patent_no text check (patent_no is null or char_length(patent_no) <= 200),
  patent_application_date date,
  patent_grant_date date,
  patent_applicants text check (patent_applicants is null or char_length(patent_applicants) <= 1000),
  patent_inventors text check (patent_inventors is null or char_length(patent_inventors) <= 1000),

  software_registration_no text check (software_registration_no is null or char_length(software_registration_no) <= 200),
  software_version text check (software_version is null or char_length(software_version) <= 100),
  software_completion_date date,
  software_registration_date date,
  software_copyright_owners text check (software_copyright_owners is null or char_length(software_copyright_owners) <= 1000),
  software_developers text check (software_developers is null or char_length(software_developers) <= 1000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint achievement_category_fields_match check (
    (
      category = 'award'
      and patent_type is null
      and patent_application_no is null
      and patent_no is null
      and patent_application_date is null
      and patent_grant_date is null
      and patent_applicants is null
      and patent_inventors is null
      and software_registration_no is null
      and software_version is null
      and software_completion_date is null
      and software_registration_date is null
      and software_copyright_owners is null
      and software_developers is null
    )
    or
    (
      category = 'patent'
      and awarding_body is null
      and award_level is null
      and award_grade is null
      and award_rank is null
      and certificate_no is null
      and award_date is null
      and award_recipients is null
      and software_registration_no is null
      and software_version is null
      and software_completion_date is null
      and software_registration_date is null
      and software_copyright_owners is null
      and software_developers is null
    )
    or
    (
      category = 'software_copyright'
      and awarding_body is null
      and award_level is null
      and award_grade is null
      and award_rank is null
      and certificate_no is null
      and award_date is null
      and award_recipients is null
      and patent_type is null
      and patent_application_no is null
      and patent_no is null
      and patent_application_date is null
      and patent_grant_date is null
      and patent_applicants is null
      and patent_inventors is null
    )
  )
);

create table if not exists public.achievement_private (
  record_id uuid primary key references public.achievement_records(id) on delete cascade,
  internal_note text check (internal_note is null or char_length(internal_note) <= 5000),
  file_path text unique,
  original_filename text check (original_filename is null or char_length(original_filename) <= 500),
  file_mime_type text check (
    file_mime_type is null
    or file_mime_type in (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  ),
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes between 1 and 20971520),
  file_uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint achievement_file_metadata_complete check (
    (file_path is null and original_filename is null and file_mime_type is null and file_size_bytes is null and file_uploaded_at is null)
    or
    (file_path is not null and original_filename is not null and file_mime_type is not null and file_size_bytes is not null and file_uploaded_at is not null)
  )
);

create index if not exists achievement_records_category_year_idx
  on public.achievement_records (category, year desc);
create index if not exists achievement_records_status_idx
  on public.achievement_records (status) where status is not null;

create or replace function public.set_achievement_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_achievement_records_updated_at on public.achievement_records;
create trigger set_achievement_records_updated_at
before update on public.achievement_records
for each row execute function public.set_achievement_updated_at();

drop trigger if exists set_achievement_private_updated_at on public.achievement_private;
create trigger set_achievement_private_updated_at
before update on public.achievement_private
for each row execute function public.set_achievement_updated_at();

create or replace function public.is_achievements_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.achievement_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_achievements_admin() from public;
grant execute on function public.is_achievements_admin() to authenticated;

alter table public.achievement_admins enable row level security;
alter table public.achievement_records enable row level security;
alter table public.achievement_private enable row level security;

revoke all on table public.achievement_admins from anon, authenticated;
revoke all on table public.achievement_records from anon, authenticated;
revoke all on table public.achievement_private from anon, authenticated;

grant select on table public.achievement_records to anon, authenticated;
grant insert, update, delete on table public.achievement_records to authenticated;
grant select, insert, update, delete on table public.achievement_private to authenticated;

drop policy if exists "achievements_public_read" on public.achievement_records;
create policy "achievements_public_read"
on public.achievement_records
for select
to anon, authenticated
using (true);

drop policy if exists "achievements_admin_insert" on public.achievement_records;
create policy "achievements_admin_insert"
on public.achievement_records
for insert
to authenticated
with check ((select public.is_achievements_admin()));

drop policy if exists "achievements_admin_update" on public.achievement_records;
create policy "achievements_admin_update"
on public.achievement_records
for update
to authenticated
using ((select public.is_achievements_admin()))
with check ((select public.is_achievements_admin()));

drop policy if exists "achievements_admin_delete" on public.achievement_records;
create policy "achievements_admin_delete"
on public.achievement_records
for delete
to authenticated
using ((select public.is_achievements_admin()));

drop policy if exists "achievements_private_read" on public.achievement_private;
create policy "achievements_private_read"
on public.achievement_private
for select
to authenticated
using ((select public.is_achievements_admin()));

drop policy if exists "achievements_private_insert" on public.achievement_private;
create policy "achievements_private_insert"
on public.achievement_private
for insert
to authenticated
with check ((select public.is_achievements_admin()));

drop policy if exists "achievements_private_update" on public.achievement_private;
create policy "achievements_private_update"
on public.achievement_private
for update
to authenticated
using ((select public.is_achievements_admin()))
with check ((select public.is_achievements_admin()));

drop policy if exists "achievements_private_delete" on public.achievement_private;
create policy "achievements_private_delete"
on public.achievement_private
for delete
to authenticated
using ((select public.is_achievements_admin()));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'achievement-files',
  'achievement-files',
  false,
  20971520,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "achievements_admin_read_files" on storage.objects;
create policy "achievements_admin_read_files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'achievement-files'
  and (select public.is_achievements_admin())
);

drop policy if exists "achievements_admin_upload_files" on storage.objects;
create policy "achievements_admin_upload_files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'achievement-files'
  and (select public.is_achievements_admin())
);

drop policy if exists "achievements_admin_update_files" on storage.objects;
create policy "achievements_admin_update_files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'achievement-files'
  and (select public.is_achievements_admin())
)
with check (
  bucket_id = 'achievement-files'
  and (select public.is_achievements_admin())
);

drop policy if exists "achievements_admin_delete_files" on storage.objects;
create policy "achievements_admin_delete_files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'achievement-files'
  and (select public.is_achievements_admin())
);

commit;

-- After creating the administrator in Authentication > Users, run the query
-- below separately. Replace the email address if the login account differs.
--
-- insert into public.achievement_admins (user_id)
-- select id from auth.users where email = 'chuyu@nju.edu.cn'
-- on conflict (user_id) do nothing;
