create table if not exists services (
  id bigserial primary key,
  name text not null unique,
  description text not null default '',
  owner text not null,
  system text not null default 'Unassigned',
  lifecycle text not null default 'experimental',
  tier text,
  service_type text,
  language text not null default 'Unknown',
  repository text not null unique,
  metadata_path text not null default '.portal/service.yaml',
  metadata jsonb not null default '{}'::jsonb,
  score integer not null default 0,
  installation_id bigint,
  updated_at timestamptz not null default now()
);

alter table services add column if not exists tier text;
update services set tier=metadata -> 'spec' ->> 'tier'
where tier is null and metadata -> 'spec' ->> 'tier' is not null and metadata -> 'spec' ->> 'tier' <> '';
alter table services add column if not exists service_type text;
update services set service_type=metadata -> 'spec' ->> 'type'
where service_type is null and metadata -> 'spec' ->> 'type' is not null and metadata -> 'spec' ->> 'type' <> '';

create table if not exists teams (
  id bigserial primary key,
  name text not null unique,
  title text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

alter table teams add column if not exists description text not null default '';
alter table teams add column if not exists links jsonb not null default '[]'::jsonb;

create table if not exists users (
  id bigserial primary key,
  github_id bigint unique,
  login text not null unique,
  name text not null,
  avatar_url text not null default '',
  email text,
  bio text,
  role text not null default 'member',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table users add column if not exists primary_team text;

create table if not exists team_members (
  team_id bigint not null references teams(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  primary key (team_id, user_id)
);

create table if not exists sync_runs (
  id bigserial primary key,
  installation_id bigint not null,
  status text not null,
  discovered integer not null default 0,
  registered integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists action_runs (
  id bigserial primary key,
  action_id text not null,
  repository text not null,
  workflow text not null,
  status text not null default 'queued',
  inputs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table action_runs add column if not exists actor_login text;
alter table action_runs add column if not exists action_version integer;

create table if not exists config_overrides (section text primary key, value jsonb not null, updated_by text not null, updated_at timestamptz not null default now());
create table if not exists config_revisions (id bigserial primary key, section text not null, value jsonb, actor_login text not null, action text not null, created_at timestamptz not null default now());
create table if not exists audit_events (id bigserial primary key, category text not null, action text not null, actor_login text not null, target text, before_value jsonb, after_value jsonb, created_at timestamptz not null default now());

create table if not exists config_state (
  id integer primary key default 1 check (id = 1),
  observed_sha text,
  applied_sha text,
  config jsonb,
  file_shas jsonb not null default '{}'::jsonb,
  status text not null default 'unavailable',
  error text,
  synced_at timestamptz,
  applied_at timestamptz
);

create table if not exists config_sync_events (
  id bigserial primary key,
  observed_sha text,
  applied_sha text,
  status text not null,
  actor_login text not null,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists webhook_deliveries (
  id bigserial primary key,
  delivery_id text not null unique,
  event text not null,
  action text,
  repository text,
  installation_id bigint,
  status text not null,
  message text,
  created_at timestamptz not null default now()
);
