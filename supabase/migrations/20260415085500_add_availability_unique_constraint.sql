-- Fix-16e: Add unique constraint to availability_templates
-- This allows upsert to work on (coach_profile_id, day_of_week, start_time)

ALTER TABLE availability_templates 
ADD CONSTRAINT availability_templates_coach_day_time_unique 
UNIQUE (coach_profile_id, day_of_week, start_time);
