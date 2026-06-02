-- MathQuest database schema
-- Run this file once in the Supabase SQL Editor.

create table if not exists public.profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    role text not null check (role in ('teacher')),
    created_at timestamptz not null default now()
);

create table if not exists public.mathquest_progress (
    user_id uuid primary key references auth.users(id) on delete cascade,
    nickname text,
    xp int not null default 0,
    stars jsonb not null default '{}'::jsonb,
    achievements text[] not null default '{}',
    updated_at timestamptz not null default now()
);

create table if not exists public.classes (
    code text primary key,
    teacher_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    grade int,
    created_at timestamptz not null default now(),
    active boolean not null default true
);

create table if not exists public.class_members (
    class_code text references public.classes(code) on delete cascade,
    user_id uuid references auth.users(id) on delete cascade,
    joined_at timestamptz not null default now(),
    primary key (class_code, user_id)
);

create table if not exists public.teacher_unlocks (
    class_code text references public.classes(code) on delete cascade,
    user_id uuid references auth.users(id) on delete cascade,
    region int not null check (region between 1 and 10),
    granted_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (class_code, user_id, region)
);

create table if not exists public.class_messages (
    id bigint generated always as identity primary key,
    class_code text not null references public.classes(code) on delete cascade,
    message text not null check (char_length(message) between 1 and 500),
    created_at timestamptz not null default now()
);

create index if not exists idx_progress_updated on public.mathquest_progress(updated_at desc);
create index if not exists idx_classes_teacher on public.classes(teacher_id);
create index if not exists idx_class_members_user on public.class_members(user_id);
create index if not exists idx_messages_class_created on public.class_messages(class_code, created_at desc);

alter table public.profiles enable row level security;
alter table public.mathquest_progress enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.teacher_unlocks enable row level security;
alter table public.class_messages enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "read own progress" on public.mathquest_progress;
drop policy if exists "read own or students progress" on public.mathquest_progress;
drop policy if exists "write own progress" on public.mathquest_progress;
drop policy if exists "update own progress" on public.mathquest_progress;
drop policy if exists "teacher reads students progress" on public.mathquest_progress;
create policy "read own or students progress" on public.mathquest_progress for select to authenticated using (
    user_id = (select auth.uid())
    or exists (
        select 1 from public.class_members cm
        join public.classes c on c.code = cm.class_code
        join public.profiles p on p.user_id = c.teacher_id and p.role = 'teacher'
        where cm.user_id = mathquest_progress.user_id and c.teacher_id = (select auth.uid())
    )
);
create policy "write own progress" on public.mathquest_progress for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own progress" on public.mathquest_progress for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "teacher manages own classes" on public.classes;
drop policy if exists "anyone reads active class by code" on public.classes;
create policy "teacher manages own classes" on public.classes for all to authenticated
using (
    teacher_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.role = 'teacher')
)
with check (
    teacher_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.role = 'teacher')
);

drop policy if exists "student reads own classes" on public.class_members;
drop policy if exists "student or teacher reads class roster" on public.class_members;
drop policy if exists "student leaves own class" on public.class_members;
drop policy if exists "teacher reads class roster" on public.class_members;
drop policy if exists "student joins own class" on public.class_members;
create policy "student or teacher reads class roster" on public.class_members for select to authenticated using (
    user_id = (select auth.uid())
    or exists (
        select 1 from public.classes c
        join public.profiles p on p.user_id = c.teacher_id and p.role = 'teacher'
        where c.code = class_members.class_code and c.teacher_id = (select auth.uid())
    )
);
create policy "student leaves own class" on public.class_members for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "student reads own unlocks" on public.teacher_unlocks;
drop policy if exists "teacher manages class unlocks" on public.teacher_unlocks;
drop policy if exists "student or teacher reads class unlocks" on public.teacher_unlocks;
drop policy if exists "teacher inserts class unlocks" on public.teacher_unlocks;
drop policy if exists "teacher updates class unlocks" on public.teacher_unlocks;
drop policy if exists "teacher deletes class unlocks" on public.teacher_unlocks;
create policy "student or teacher reads class unlocks" on public.teacher_unlocks for select to authenticated using (
    user_id = (select auth.uid())
    or (
        granted_by = (select auth.uid())
        and exists (
            select 1 from public.classes c
            join public.profiles p on p.user_id = c.teacher_id and p.role = 'teacher'
            where c.code = teacher_unlocks.class_code and c.teacher_id = (select auth.uid())
        )
    )
);
create policy "teacher inserts class unlocks" on public.teacher_unlocks for insert to authenticated with check (
    granted_by = (select auth.uid())
    and exists (
        select 1 from public.classes c
        join public.class_members cm on cm.class_code = c.code and cm.user_id = teacher_unlocks.user_id
        join public.profiles p on p.user_id = c.teacher_id and p.role = 'teacher'
        where c.code = teacher_unlocks.class_code and c.teacher_id = (select auth.uid())
    )
);
create policy "teacher updates class unlocks" on public.teacher_unlocks for update to authenticated using (
    granted_by = (select auth.uid())
    and exists (
        select 1 from public.classes c
        join public.profiles p on p.user_id = c.teacher_id and p.role = 'teacher'
        where c.code = teacher_unlocks.class_code and c.teacher_id = (select auth.uid())
    )
) with check (
    granted_by = (select auth.uid())
    and exists (
        select 1 from public.classes c
        join public.class_members cm on cm.class_code = c.code and cm.user_id = teacher_unlocks.user_id
        join public.profiles p on p.user_id = c.teacher_id and p.role = 'teacher'
        where c.code = teacher_unlocks.class_code and c.teacher_id = (select auth.uid())
    )
);
create policy "teacher deletes class unlocks" on public.teacher_unlocks for delete to authenticated using (
    granted_by = (select auth.uid())
    and exists (
        select 1 from public.classes c
        join public.profiles p on p.user_id = c.teacher_id and p.role = 'teacher'
        where c.code = teacher_unlocks.class_code and c.teacher_id = (select auth.uid())
    )
);

drop policy if exists "members read class messages" on public.class_messages;
drop policy if exists "teachers send class messages" on public.class_messages;
create policy "members read class messages" on public.class_messages for select to authenticated using (
    exists (
        select 1 from public.class_members cm
        where cm.class_code = class_messages.class_code and cm.user_id = (select auth.uid())
    )
);
create policy "teachers send class messages" on public.class_messages for insert to authenticated with check (
    exists (
        select 1 from public.classes c
        join public.profiles p on p.user_id = c.teacher_id and p.role = 'teacher'
        where c.code = class_messages.class_code and c.teacher_id = (select auth.uid())
    )
);

create or replace function public.join_class(p_code text)
returns table(code text, name text)
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then raise exception 'authentication required'; end if;
    insert into public.class_members(class_code, user_id)
    select c.code, auth.uid() from public.classes c
    where c.code = upper(trim(p_code)) and c.active = true
    on conflict do nothing;
    return query select c.code, c.name from public.classes c
    where c.code = upper(trim(p_code)) and c.active = true;
end;
$$;

create or replace function public.class_leaderboard(p_class_code text)
returns table(nickname text, xp int, stars jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (
        select 1 from public.class_members cm
        where cm.class_code = p_class_code and cm.user_id = auth.uid()
    ) then raise exception 'not a class member'; end if;
    return query
    select mp.nickname, mp.xp, mp.stars
    from public.class_members cm
    join public.mathquest_progress mp on mp.user_id = cm.user_id
    where cm.class_code = p_class_code
    order by mp.xp desc
    limit 50;
end;
$$;

revoke all on function public.join_class(text) from public;
revoke all on function public.class_leaderboard(text) from public;
revoke all on function public.join_class(text) from anon;
revoke all on function public.class_leaderboard(text) from anon;
grant execute on function public.join_class(text) to authenticated;
grant execute on function public.class_leaderboard(text) to authenticated;

-- After a teacher creates an account, approve it manually:
-- insert into public.profiles(user_id, role)
-- select id, 'teacher' from auth.users where email = 'teacher@example.com'
-- on conflict (user_id) do update set role = excluded.role;
