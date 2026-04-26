-- Interest registrations (coaches who want to be contacted at launch)
CREATE TABLE interest_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('coach', 'parent', 'player')),
  sports TEXT[] DEFAULT '{}',
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_interest_registrations_role
  ON interest_registrations(role);
CREATE INDEX idx_interest_registrations_created_at
  ON interest_registrations(created_at DESC);

ALTER TABLE interest_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can insert interest registrations"
  ON interest_registrations FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Admins can read interest registrations"
  ON interest_registrations FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin');

-- Waitlist emails (parents/players who want launch notification)
CREATE TABLE waitlist_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  role TEXT CHECK (role IN ('parent', 'player')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE waitlist_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can insert waitlist emails"
  ON waitlist_emails FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Admins can read waitlist emails"
  ON waitlist_emails FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin');
