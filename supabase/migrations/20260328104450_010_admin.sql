-- Migration 010: Create admin and governance tables
-- Created: 2026-03-28
-- Description: Admin roles, content pages, session notes, DBS verifications, disputes, promo codes, and audit logs
-- Final migration file completing the database schema

-- ============================================
-- Table: admin_roles
-- ============================================
-- Admin users and their permission levels within the platform.
-- Role-based access control for the Super Admin panel.

CREATE TABLE admin_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
    permission_level text NOT NULL,
    granted_by_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_permission UNIQUE(user_profile_id, permission_level),
    CONSTRAINT valid_permission_level CHECK (permission_level IN ('full', 'user_management', 'finance', 'content'))
);

-- ============================================
-- Table: content_pages
-- ============================================
-- Admin-managed static content pages and email templates.
-- T&Cs, Privacy Policy, FAQs, email templates — all admin editable.

CREATE TABLE content_pages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    is_published boolean NOT NULL DEFAULT false,
    published_at timestamptz,
    published_by_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_content_key UNIQUE(key),
    CONSTRAINT valid_content_type CHECK (type IN ('page', 'email_template', 'announcement'))
);

-- ============================================
-- Table: session_notes
-- ============================================
-- Basic session notes written by coaches after each session. Available on Free tier.
-- Free tier equivalent of performance reports — simple text notes.

CREATE TABLE session_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE RESTRICT,
    notes text NOT NULL,
    is_shared_with_parent boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_booking_notes UNIQUE(booking_id)
);

-- ============================================
-- Table: dbs_verifications
-- ============================================
-- Tracks DBS certificate submissions and verification status.
-- Coach trust badge verification workflow.

CREATE TABLE dbs_verifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE RESTRICT,
    payment_intent_id uuid REFERENCES payment_intents(id) ON DELETE SET NULL,
    certificate_number text,
    certificate_url text,
    submitted_at timestamptz,
    reviewed_at timestamptz,
    reviewed_by_admin_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'pending_payment',
    rejection_reason text,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT valid_dbs_status CHECK (status IN ('pending_payment', 'pending_review', 'approved', 'rejected'))
);

-- ============================================
-- Table: disputes
-- ============================================
-- Tracks disputes between parents and coaches.
-- Admin resolution workflow for booking conflicts.

CREATE TABLE disputes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    raised_by_user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
    dispute_type text NOT NULL,
    description text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    resolution text,
    resolved_by_admin_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    resolved_at timestamptz,
    refund_issued boolean NOT NULL DEFAULT false,
    refund_amount_pence integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT valid_dispute_type CHECK (dispute_type IN ('no_show_coach', 'no_show_parent', 'quality', 'payment', 'other')),
    CONSTRAINT valid_dispute_status CHECK (status IN ('open', 'under_review', 'resolved', 'closed'))
);

-- ============================================
-- Table: promo_codes
-- ============================================
-- Admin-created promotional discount codes.
-- Marketing campaigns, early adopter incentives.

CREATE TABLE promo_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL,
    discount_type text NOT NULL,
    discount_value integer NOT NULL,
    currency text DEFAULT 'GBP',
    max_uses integer,
    current_uses integer NOT NULL DEFAULT 0,
    min_booking_value_pence integer,
    sport_id uuid REFERENCES sports(id) ON DELETE SET NULL,
    valid_from timestamptz NOT NULL,
    valid_until timestamptz,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_promo_code UNIQUE(code),
    CONSTRAINT valid_discount_type CHECK (discount_type IN ('percentage', 'fixed_amount')),
    CONSTRAINT valid_discount_value CHECK (discount_value > 0),
    CONSTRAINT valid_current_uses CHECK (current_uses >= 0)
);

-- ============================================
-- Table: audit_logs
-- ============================================
-- Immutable log of all admin actions.
-- Compliance, accountability, debugging.

CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    before_state jsonb,
    after_state jsonb,
    notes text,
    ip_address text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- Indexes
-- ============================================

-- admin_roles indexes
CREATE INDEX admin_roles_user_profile_id_idx ON admin_roles(user_profile_id);
CREATE INDEX admin_roles_permission_level_idx ON admin_roles(permission_level);
CREATE INDEX admin_roles_is_active_idx ON admin_roles(is_active) WHERE is_active = true;

-- content_pages indexes
CREATE INDEX content_pages_key_idx ON content_pages(key);
CREATE INDEX content_pages_type_idx ON content_pages(type);
CREATE INDEX content_pages_is_published_idx ON content_pages(is_published) WHERE is_published = true;

-- session_notes indexes
CREATE INDEX session_notes_booking_id_idx ON session_notes(booking_id);
CREATE INDEX session_notes_coach_profile_id_idx ON session_notes(coach_profile_id);

-- dbs_verifications indexes
CREATE INDEX dbs_verifications_coach_profile_id_idx ON dbs_verifications(coach_profile_id);
CREATE INDEX dbs_verifications_status_idx ON dbs_verifications(status);

-- disputes indexes
CREATE INDEX disputes_booking_id_idx ON disputes(booking_id);
CREATE INDEX disputes_raised_by_user_id_idx ON disputes(raised_by_user_id);
CREATE INDEX disputes_status_idx ON disputes(status);

-- promo_codes indexes
CREATE INDEX promo_codes_code_idx ON promo_codes(code);
CREATE INDEX promo_codes_is_active_idx ON promo_codes(is_active) WHERE is_active = true;
CREATE INDEX promo_codes_valid_from_idx ON promo_codes(valid_from);
CREATE INDEX promo_codes_valid_until_idx ON promo_codes(valid_until);

-- audit_logs indexes
CREATE INDEX audit_logs_admin_user_id_idx ON audit_logs(admin_user_id);
CREATE INDEX audit_logs_entity_type_idx ON audit_logs(entity_type);
CREATE INDEX audit_logs_entity_id_idx ON audit_logs(entity_id);
CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at DESC);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dbs_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies: admin_roles
-- ============================================

-- SELECT: Admin only (service role will handle admin checks in application code)
-- No user policies = service role only

-- INSERT/UPDATE/DELETE: Full access admin only (service role)
-- No user policies = service role only

-- ============================================
-- RLS Policies: content_pages
-- ============================================

-- SELECT: Public for published pages
CREATE POLICY "Public can view published content pages"
    ON content_pages
    FOR SELECT
    USING (is_published = true);

-- INSERT/UPDATE/DELETE: Admin only (service role)
-- No INSERT, UPDATE, or DELETE policies = service role only

-- ============================================
-- RLS Policies: session_notes
-- ============================================

-- SELECT: Coach who wrote it + parent/player if is_shared_with_parent = true
CREATE POLICY "Coaches can view own session notes"
    ON session_notes
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = session_notes.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Parents can view shared session notes for own children"
    ON session_notes
    FOR SELECT
    USING (
        is_shared_with_parent = true
        AND EXISTS (
            SELECT 1 FROM bookings
            JOIN child_profiles ON child_profiles.id = bookings.child_profile_id
            JOIN parent_profiles ON parent_profiles.id = child_profiles.parent_profile_id
            JOIN user_profiles ON user_profiles.id = parent_profiles.user_profile_id
            WHERE bookings.id = session_notes.booking_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Players can view shared session notes for themselves"
    ON session_notes
    FOR SELECT
    USING (
        is_shared_with_parent = true
        AND EXISTS (
            SELECT 1 FROM bookings
            JOIN player_profiles ON player_profiles.id = bookings.player_profile_id
            JOIN user_profiles ON user_profiles.id = player_profiles.user_profile_id
            WHERE bookings.id = session_notes.booking_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT: Authenticated coach for their confirmed bookings
CREATE POLICY "Coaches can create session notes for own bookings"
    ON session_notes
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = session_notes.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = session_notes.booking_id
            AND bookings.coach_profile_id = session_notes.coach_profile_id
        )
    );

-- UPDATE: Coach only, within 48 hours of session (enforced in application code)
CREATE POLICY "Coaches can update own session notes"
    ON session_notes
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = session_notes.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = session_notes.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- ============================================
-- RLS Policies: dbs_verifications
-- ============================================

-- SELECT: Coach who submitted, or admin
CREATE POLICY "Coaches can view own DBS verifications"
    ON dbs_verifications
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = dbs_verifications.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT: Authenticated coach only
CREATE POLICY "Coaches can create DBS verifications"
    ON dbs_verifications
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = dbs_verifications.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- UPDATE: Admin only (service role)
-- No UPDATE policy = service role only

-- ============================================
-- RLS Policies: disputes
-- ============================================

-- SELECT: User who raised it
CREATE POLICY "Users can view own disputes"
    ON disputes
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = disputes.raised_by_user_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT: Authenticated users only
CREATE POLICY "Authenticated users can create disputes"
    ON disputes
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = disputes.raised_by_user_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- UPDATE: Admin only (service role)
-- No UPDATE policy = service role only

-- ============================================
-- RLS Policies: promo_codes
-- ============================================

-- SELECT: Admin only for full details (service role)
-- No user SELECT policy = service role only

-- INSERT/UPDATE/DELETE: Admin only (service role)
-- No user policies = service role only

-- ============================================
-- RLS Policies: audit_logs
-- ============================================

-- SELECT: Admin only (service role)
-- No user SELECT policy = service role only

-- INSERT: Service role only
-- No INSERT policy = service role only

-- UPDATE/DELETE: Not permitted — immutable log
-- No UPDATE or DELETE policies = no updates or deletes allowed

-- ============================================
-- Triggers for updated_at
-- ============================================

-- Trigger for admin_roles
CREATE TRIGGER update_admin_roles_updated_at
    BEFORE UPDATE ON admin_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for content_pages
CREATE TRIGGER update_content_pages_updated_at
    BEFORE UPDATE ON content_pages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for session_notes
CREATE TRIGGER update_session_notes_updated_at
    BEFORE UPDATE ON session_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for dbs_verifications
CREATE TRIGGER update_dbs_verifications_updated_at
    BEFORE UPDATE ON dbs_verifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for disputes
CREATE TRIGGER update_disputes_updated_at
    BEFORE UPDATE ON disputes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for promo_codes
CREATE TRIGGER update_promo_codes_updated_at
    BEFORE UPDATE ON promo_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Note: audit_logs table has no updated_at column (immutable append-only log)
