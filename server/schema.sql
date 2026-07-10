create table if not exists services (
  id bigserial primary key,
  name text not null unique,
  description text not null default '',
  owner text not null,
  system text not null default 'Unassigned',
  lifecycle text not null default 'experimental',
  language text not null default 'Unknown',
  repository text not null unique,
  metadata_path text not null default '.portal/service.yaml',
  metadata jsonb not null default '{}'::jsonb,
  score integer not null default 0,
  installation_id bigint,
  updated_at timestamptz not null default now()
);

create table if not exists teams (
  id bigserial primary key,
  name text not null unique,
  title text not null,
  members jsonb not null default '[]'::jsonb
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
