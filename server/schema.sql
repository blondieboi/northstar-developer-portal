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
  scorecards jsonb not null default '{}'::jsonb,
  installation_id bigint,
  updated_at timestamptz not null default now()
);

alter table services add column if not exists tier text;
update services set tier=metadata -> 'spec' ->> 'tier'
where tier is null and metadata -> 'spec' ->> 'tier' is not null and metadata -> 'spec' ->> 'tier' <> '';
alter table services add column if not exists service_type text;
update services set service_type=metadata -> 'spec' ->> 'type'
where service_type is null and metadata -> 'spec' ->> 'type' is not null and metadata -> 'spec' ->> 'type' <> '';
alter table services add column if not exists scorecards jsonb not null default '{}'::jsonb;

create table if not exists service_score_history (
  id bigserial primary key,
  service_id bigint not null references services(id) on delete cascade,
  score integer not null,
  scorecards jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);
create index if not exists service_score_history_service_time on service_score_history(service_id, recorded_at desc);

create table if not exists plugin_snapshots (
  plugin_id text not null,
  entity_kind text not null,
  entity_key text not null,
  status text not null,
  data jsonb,
  error text,
  observed_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (plugin_id, entity_kind, entity_key)
);

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
  results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table sync_runs add column if not exists results jsonb not null default '[]'::jsonb;

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

create table if not exists service_relations (
  id bigserial primary key,
  service_id bigint not null references services(id) on delete cascade,
  source_kind text not null default 'service',
  source_key text not null,
  relation_type text not null,
  target_kind text not null,
  target_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(service_id, source_kind, source_key, relation_type, target_kind, target_key)
);
create index if not exists service_relations_target on service_relations(target_kind, target_key);

create table if not exists service_documents (
  id bigserial primary key,
  service_id bigint not null references services(id) on delete cascade,
  path text not null,
  title text not null,
  content text not null,
  sha text,
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  unique(service_id, path)
);
create index if not exists service_documents_search on service_documents(service_id, source_updated_at desc);

create table if not exists metadata_campaigns (
  id bigserial primary key,
  title text not null,
  description text not null default '',
  field_path text not null,
  desired_value jsonb not null,
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_by text not null,
  created_at timestamptz not null default now(),
  launched_at timestamptz,
  completed_at timestamptz
);

create table if not exists metadata_campaign_targets (
  id bigserial primary key,
  campaign_id bigint not null references metadata_campaigns(id) on delete cascade,
  service_id bigint references services(id) on delete set null,
  service_name text not null,
  repository text not null,
  before_value jsonb,
  after_value jsonb,
  patch jsonb not null default '[]'::jsonb,
  confidence text not null default 'explicit',
  status text not null default 'pending',
  pr_number integer,
  pr_url text,
  branch text,
  error text,
  exclusion_reason text,
  updated_at timestamptz not null default now(),
  unique(campaign_id, repository)
);
create index if not exists metadata_campaign_targets_status on metadata_campaign_targets(campaign_id, status);

create table if not exists scorecard_remediations (
  id bigserial primary key,
  service_id bigint references services(id) on delete set null,
  service_name text not null,
  repository text not null,
  scorecard_id text not null,
  rule_id text not null,
  field_path text not null,
  before_value jsonb,
  after_value jsonb not null,
  status text not null default 'pr-open',
  pr_number integer,
  pr_url text,
  branch text,
  requested_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(repository, pr_number)
);
create index if not exists scorecard_remediations_service on scorecard_remediations(service_name, created_at desc);

create table if not exists scorecard_waivers (
  id bigserial primary key,
  service_id bigint not null references services(id) on delete cascade,
  scorecard_id text not null,
  rule_id text not null,
  reason text not null,
  status text not null default 'requested',
  requested_by text not null,
  decided_by text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists scorecard_waivers_lookup on scorecard_waivers(service_id, scorecard_id, rule_id, status, expires_at);

create table if not exists portal_events (
  id bigserial primary key,
  event_type text not null,
  actor_login text,
  path text,
  entity_kind text,
  entity_key text,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists portal_events_type_time on portal_events(event_type, created_at desc);
