-- Add GDPR consent fields to interest_registrations and waitlist_emails
-- Existing rows default to false (no consent recorded — pre-consent-checkbox submissions)

ALTER TABLE interest_registrations
  ADD COLUMN IF NOT EXISTS consent_given BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;

ALTER TABLE waitlist_emails
  ADD COLUMN IF NOT EXISTS consent_given BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;
