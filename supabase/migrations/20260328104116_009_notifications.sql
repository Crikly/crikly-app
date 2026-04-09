-- Migration 009: Create notification tables
-- Created: 2026-03-28
-- Description: Notification preferences and in-app notifications
-- User-controlled notification settings and activity feed

-- ============================================
-- Table: notification_preferences
-- ============================================
-- User-controlled notification settings.
-- Let users manage how and when they receive notifications.
-- One row per user — created automatically on signup.

CREATE TABLE notification_preferences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    email_booking_confirmed boolean NOT NULL DEFAULT true,
    email_booking_cancelled boolean NOT NULL DEFAULT true,
    email_session_reminder boolean NOT NULL DEFAULT true,
    email_payout_processed boolean NOT NULL DEFAULT true,
    email_review_reminder boolean NOT NULL DEFAULT true,
    email_marketing boolean NOT NULL DEFAULT false,
    push_booking_confirmed boolean NOT NULL DEFAULT true,
    push_booking_cancelled boolean NOT NULL DEFAULT true,
    push_session_reminder boolean NOT NULL DEFAULT true,
    push_new_message boolean NOT NULL DEFAULT true,
    push_marketing boolean NOT NULL DEFAULT false,
    sms_enabled boolean NOT NULL DEFAULT false,
    whatsapp_enabled boolean NOT NULL DEFAULT false,
    onesignal_subscription_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_preferences UNIQUE(user_profile_id)
);

-- ============================================
-- Table: notifications
-- ============================================
-- In-app notification history.
-- Activity feed and notification inbox within the app.

CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    data jsonb,
    is_read boolean NOT NULL DEFAULT false,
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- Indexes
-- ============================================

-- notification_preferences indexes
CREATE INDEX notification_preferences_user_profile_id_idx ON notification_preferences(user_profile_id);

-- notifications indexes
CREATE INDEX notifications_user_profile_id_idx ON notifications(user_profile_id);
CREATE INDEX notifications_user_profile_id_is_read_idx ON notifications(user_profile_id, is_read);
CREATE INDEX notifications_created_at_idx ON notifications(created_at DESC);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on both tables
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies: notification_preferences
-- ============================================

-- SELECT: Own record only
CREATE POLICY "Users can view own notification preferences"
    ON notification_preferences
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = notification_preferences.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- UPDATE: Own record only
CREATE POLICY "Users can update own notification preferences"
    ON notification_preferences
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = notification_preferences.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = notification_preferences.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT: Service role only (created automatically on signup)
-- No INSERT policy = service role only

-- ============================================
-- RLS Policies: notifications
-- ============================================

-- SELECT: Own notifications only
CREATE POLICY "Users can view own notifications"
    ON notifications
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = notifications.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- UPDATE (is_read only): Own notifications only
CREATE POLICY "Users can mark own notifications as read"
    ON notifications
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = notifications.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = notifications.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT: Service role only (notifications created by system)
-- No INSERT policy = service role only

-- ============================================
-- Triggers for updated_at
-- ============================================

-- Trigger for notification_preferences
CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Note: notifications table has no updated_at column (append-only log)
