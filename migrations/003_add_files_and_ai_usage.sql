-- Migration: add file metadata table and ai_usage_logs

CREATE TABLE IF NOT EXISTS resource_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL,
  s3_key text NOT NULL,
  url text,
  filename text NOT NULL,
  content_type text,
  size bigint,
  uploaded_by uuid,
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resource_files_resource_id ON resource_files(resource_id);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  type text NOT NULL,
  prompt text,
  result_summary text,
  resource_id uuid,
  cost numeric,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_logs(user_id);
