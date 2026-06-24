export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_roles: {
        Row: {
          created_at: string
          granted_by_user_id: string | null
          id: string
          is_active: boolean
          permission_level: string
          updated_at: string
          user_profile_id: string
        }
        Insert: {
          created_at?: string
          granted_by_user_id?: string | null
          id?: string
          is_active?: boolean
          permission_level: string
          updated_at?: string
          user_profile_id: string
        }
        Update: {
          created_at?: string
          granted_by_user_id?: string | null
          id?: string
          is_active?: boolean
          permission_level?: string
          updated_at?: string
          user_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_roles_granted_by_user_id_fkey"
            columns: ["granted_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_roles_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          notes: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          notes?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_templates: {
        Row: {
          coach_profile_id: string
          coach_venue_id: string | null
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          is_recurring: boolean
          notes: string | null
          price_override_pence: number | null
          session_type_id: string | null
          specific_date: string | null
          sport_id: string | null
          start_time: string
          updated_at: string
          venue_address: string | null
          venue_name: string | null
        }
        Insert: {
          coach_profile_id: string
          coach_venue_id?: string | null
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          notes?: string | null
          price_override_pence?: number | null
          session_type_id?: string | null
          specific_date?: string | null
          sport_id?: string | null
          start_time: string
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
        }
        Update: {
          coach_profile_id?: string
          coach_venue_id?: string | null
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          notes?: string | null
          price_override_pence?: number | null
          session_type_id?: string | null
          specific_date?: string | null
          sport_id?: string | null
          start_time?: string
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_templates_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_templates_coach_venue_id_fkey"
            columns: ["coach_venue_id"]
            isOneToOne: false
            referencedRelation: "coach_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_templates_session_type_id_fkey"
            columns: ["session_type_id"]
            isOneToOne: false
            referencedRelation: "coach_session_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_templates_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_dates: {
        Row: {
          blocked_date: string
          blocked_date_end: string | null
          coach_profile_id: string
          created_at: string
          id: string
          label: string | null
          reason: string | null
          updated_at: string
        }
        Insert: {
          blocked_date: string
          blocked_date_end?: string | null
          coach_profile_id: string
          created_at?: string
          id?: string
          label?: string | null
          reason?: string | null
          updated_at?: string
        }
        Update: {
          blocked_date?: string
          blocked_date_end?: string | null
          coach_profile_id?: string
          created_at?: string
          id?: string
          label?: string | null
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_dates_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          availability_template_id: string | null
          booked_by_user_id: string
          booking_reference: string
          cancellation_reason: string | null
          cancellation_window_hours: number
          cancelled_at: string | null
          cancelled_by: string | null
          child_profile_id: string | null
          coach_price_pence: number
          coach_profile_id: string
          commission_pence: number
          commission_rate: number
          completed_at: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          discount_applied_pence: number | null
          group_booking_id: string | null
          id: string
          messaging_unlocked: boolean
          notes_for_coach: string | null
          parent_total_pence: number
          payout_eligible_at: string | null
          player_profile_id: string | null
          promo_code_id: string | null
          review_requested_at: string | null
          session_date: string
          session_end_time: string
          session_start_time: string
          session_type: string
          sport_id: string
          status: string
          updated_at: string
          venue_address: string | null
          venue_id: string | null
          venue_name: string | null
        }
        Insert: {
          availability_template_id?: string | null
          booked_by_user_id: string
          booking_reference: string
          cancellation_reason?: string | null
          cancellation_window_hours?: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          child_profile_id?: string | null
          coach_price_pence: number
          coach_profile_id: string
          commission_pence: number
          commission_rate: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          discount_applied_pence?: number | null
          group_booking_id?: string | null
          id?: string
          messaging_unlocked?: boolean
          notes_for_coach?: string | null
          parent_total_pence: number
          payout_eligible_at?: string | null
          player_profile_id?: string | null
          promo_code_id?: string | null
          review_requested_at?: string | null
          session_date: string
          session_end_time: string
          session_start_time: string
          session_type: string
          sport_id: string
          status?: string
          updated_at?: string
          venue_address?: string | null
          venue_id?: string | null
          venue_name?: string | null
        }
        Update: {
          availability_template_id?: string | null
          booked_by_user_id?: string
          booking_reference?: string
          cancellation_reason?: string | null
          cancellation_window_hours?: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          child_profile_id?: string | null
          coach_price_pence?: number
          coach_profile_id?: string
          commission_pence?: number
          commission_rate?: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          discount_applied_pence?: number | null
          group_booking_id?: string | null
          id?: string
          messaging_unlocked?: boolean
          notes_for_coach?: string | null
          parent_total_pence?: number
          payout_eligible_at?: string | null
          player_profile_id?: string | null
          promo_code_id?: string | null
          review_requested_at?: string | null
          session_date?: string
          session_end_time?: string
          session_start_time?: string
          session_type?: string
          sport_id?: string
          status?: string
          updated_at?: string
          venue_address?: string | null
          venue_id?: string | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_availability_template_id_fkey"
            columns: ["availability_template_id"]
            isOneToOne: false
            referencedRelation: "availability_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_booked_by_user_id_fkey"
            columns: ["booked_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_child_profile_id_fkey"
            columns: ["child_profile_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_group_booking_id_fkey"
            columns: ["group_booking_id"]
            isOneToOne: false
            referencedRelation: "group_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_player_profile_id_fkey"
            columns: ["player_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "coach_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      child_profiles: {
        Row: {
          created_at: string
          date_of_birth: string
          deleted_at: string | null
          full_name: string
          id: string
          medical_notes: string | null
          notes_for_coach: string | null
          parent_profile_id: string
          passport_privacy: string
          skill_level: string
          sport_ids: string[]
          transition_initiated_at: string | null
          transition_status: string
          transitioned_player_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_of_birth: string
          deleted_at?: string | null
          full_name: string
          id?: string
          medical_notes?: string | null
          notes_for_coach?: string | null
          parent_profile_id: string
          passport_privacy?: string
          skill_level: string
          sport_ids: string[]
          transition_initiated_at?: string | null
          transition_status?: string
          transitioned_player_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string
          deleted_at?: string | null
          full_name?: string
          id?: string
          medical_notes?: string | null
          notes_for_coach?: string | null
          parent_profile_id?: string
          passport_privacy?: string
          skill_level?: string
          sport_ids?: string[]
          transition_initiated_at?: string | null
          transition_status?: string
          transitioned_player_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_profiles_parent_profile_id_fkey"
            columns: ["parent_profile_id"]
            isOneToOne: false
            referencedRelation: "parent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_profiles_transitioned_player_id_fkey"
            columns: ["transitioned_player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_photos: {
        Row: {
          coach_profile_id: string
          created_at: string
          id: string
          is_primary: boolean
          photo_url: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          coach_profile_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          photo_url: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          coach_profile_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          photo_url?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_photos_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_profiles: {
        Row: {
          approval_window_hours: number
          bio: string | null
          cancellation_window_hours: number
          club_affiliation: string | null
          created_at: string
          dbs_expires_at: string | null
          dbs_status: string
          dbs_verified_at: string | null
          deleted_at: string | null
          display_name: string | null
          gender: string | null
          id: string
          is_featured: boolean
          is_flagged: boolean
          is_paused: boolean
          is_profile_live: boolean
          is_suspended: boolean
          languages: string[] | null
          max_advance_days: number
          min_advance_hours: number
          rating_avg: number | null
          rating_count: number
          requires_manual_approval: boolean
          sessions_completed: number
          slug: string | null
          stripe_account_id: string | null
          stripe_onboarding_complete: boolean
          subscription_tier_id: string | null
          travel_radius_miles: number | null
          updated_at: string
          user_profile_id: string
          years_experience: number | null
        }
        Insert: {
          approval_window_hours?: number
          bio?: string | null
          cancellation_window_hours?: number
          club_affiliation?: string | null
          created_at?: string
          dbs_expires_at?: string | null
          dbs_status?: string
          dbs_verified_at?: string | null
          deleted_at?: string | null
          display_name?: string | null
          gender?: string | null
          id?: string
          is_featured?: boolean
          is_flagged?: boolean
          is_paused?: boolean
          is_profile_live?: boolean
          is_suspended?: boolean
          languages?: string[] | null
          max_advance_days?: number
          min_advance_hours?: number
          rating_avg?: number | null
          rating_count?: number
          requires_manual_approval?: boolean
          sessions_completed?: number
          slug?: string | null
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean
          subscription_tier_id?: string | null
          travel_radius_miles?: number | null
          updated_at?: string
          user_profile_id: string
          years_experience?: number | null
        }
        Update: {
          approval_window_hours?: number
          bio?: string | null
          cancellation_window_hours?: number
          club_affiliation?: string | null
          created_at?: string
          dbs_expires_at?: string | null
          dbs_status?: string
          dbs_verified_at?: string | null
          deleted_at?: string | null
          display_name?: string | null
          gender?: string | null
          id?: string
          is_featured?: boolean
          is_flagged?: boolean
          is_paused?: boolean
          is_profile_live?: boolean
          is_suspended?: boolean
          languages?: string[] | null
          max_advance_days?: number
          min_advance_hours?: number
          rating_avg?: number | null
          rating_count?: number
          requires_manual_approval?: boolean
          sessions_completed?: number
          slug?: string | null
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean
          subscription_tier_id?: string | null
          travel_radius_miles?: number | null
          updated_at?: string
          user_profile_id?: string
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_profiles_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_qualifications: {
        Row: {
          coach_profile_id: string
          created_at: string
          custom_name: string | null
          expiry_date: string | null
          id: string
          issued_date: string | null
          issuing_body: string | null
          notes: string | null
          qualification_type_id: string | null
          updated_at: string
        }
        Insert: {
          coach_profile_id: string
          created_at?: string
          custom_name?: string | null
          expiry_date?: string | null
          id?: string
          issued_date?: string | null
          issuing_body?: string | null
          notes?: string | null
          qualification_type_id?: string | null
          updated_at?: string
        }
        Update: {
          coach_profile_id?: string
          created_at?: string
          custom_name?: string | null
          expiry_date?: string | null
          id?: string
          issued_date?: string | null
          issuing_body?: string | null
          notes?: string | null
          qualification_type_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_qualifications_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_replies: {
        Row: {
          coach_profile_id: string
          created_at: string
          id: string
          reply_text: string
          review_id: string
          updated_at: string
        }
        Insert: {
          coach_profile_id: string
          created_at?: string
          id?: string
          reply_text: string
          review_id: string
          updated_at?: string
        }
        Update: {
          coach_profile_id?: string
          created_at?: string
          id?: string
          reply_text?: string
          review_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_replies_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_replies_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_session_types: {
        Row: {
          coach_sport_id: string
          created_at: string
          currency: string
          duration_minutes: number
          id: string
          is_active: boolean
          price_group_pence: number | null
          price_individual_pence: number | null
          updated_at: string
        }
        Insert: {
          coach_sport_id: string
          created_at?: string
          currency?: string
          duration_minutes: number
          id?: string
          is_active?: boolean
          price_group_pence?: number | null
          price_individual_pence?: number | null
          updated_at?: string
        }
        Update: {
          coach_sport_id?: string
          created_at?: string
          currency?: string
          duration_minutes?: number
          id?: string
          is_active?: boolean
          price_group_pence?: number | null
          price_individual_pence?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_session_types_coach_sport_id_fkey"
            columns: ["coach_sport_id"]
            isOneToOne: false
            referencedRelation: "coach_sports"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_sports: {
        Row: {
          age_groups: string[] | null
          cancellation_window_hours: number | null
          coach_profile_id: string
          created_at: string
          currency: string
          id: string
          is_active: boolean
          max_advance_days: number | null
          max_group_size: number | null
          min_advance_hours: number | null
          no_show_policy: string | null
          no_show_refund_percentage: number
          price_group_pence: number | null
          price_individual_pence: number | null
          session_duration_minutes: number
          session_types: string[]
          skill_levels: string[]
          sport_id: string
          updated_at: string
        }
        Insert: {
          age_groups?: string[] | null
          cancellation_window_hours?: number | null
          coach_profile_id: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          max_advance_days?: number | null
          max_group_size?: number | null
          min_advance_hours?: number | null
          no_show_policy?: string | null
          no_show_refund_percentage?: number
          price_group_pence?: number | null
          price_individual_pence?: number | null
          session_duration_minutes?: number
          session_types: string[]
          skill_levels: string[]
          sport_id: string
          updated_at?: string
        }
        Update: {
          age_groups?: string[] | null
          cancellation_window_hours?: number | null
          coach_profile_id?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          max_advance_days?: number | null
          max_group_size?: number | null
          min_advance_hours?: number | null
          no_show_policy?: string | null
          no_show_refund_percentage?: number
          price_group_pence?: number | null
          price_individual_pence?: number | null
          session_duration_minutes?: number
          session_types?: string[]
          skill_levels?: string[]
          sport_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_sports_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_subscriptions: {
        Row: {
          billing_period: string | null
          cancelled_at: string | null
          coach_profile_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier_id: string
          updated_at: string
        }
        Insert: {
          billing_period?: string | null
          cancelled_at?: string | null
          coach_profile_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier_id: string
          updated_at?: string
        }
        Update: {
          billing_period?: string | null
          cancelled_at?: string | null
          coach_profile_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_subscriptions_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_subscriptions_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "subscription_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_venues: {
        Row: {
          address: string | null
          coach_profile_id: string
          created_at: string
          id: string
          is_default: boolean
          lat: number | null
          lng: number | null
          name: string
          postcode: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          coach_profile_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          postcode?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          coach_profile_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          postcode?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_venues_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_pages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_published: boolean
          key: string
          published_at: string | null
          published_by_user_id: string | null
          title: string
          type: string
          updated_at: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_published?: boolean
          key: string
          published_at?: string | null
          published_by_user_id?: string | null
          title: string
          type: string
          updated_at?: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_published?: boolean
          key?: string
          published_at?: string | null
          published_by_user_id?: string | null
          title?: string
          type?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_pages_published_by_user_id_fkey"
            columns: ["published_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          created_at: string
          currency_code: string
          default_cancellation_hours: number
          default_commission_rate: number
          default_max_advance_days: number
          default_min_advance_hours: number
          id: string
          is_active: boolean
          name: string
          payout_delay_hours: number
          tax_year_start_month: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency_code: string
          default_cancellation_hours?: number
          default_commission_rate?: number
          default_max_advance_days?: number
          default_min_advance_hours?: number
          id?: string
          is_active?: boolean
          name: string
          payout_delay_hours?: number
          tax_year_start_month?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency_code?: string
          default_cancellation_hours?: number
          default_commission_rate?: number
          default_max_advance_days?: number
          default_min_advance_hours?: number
          id?: string
          is_active?: boolean
          name?: string
          payout_delay_hours?: number
          tax_year_start_month?: number
          updated_at?: string
        }
        Relationships: []
      }
      dbs_verifications: {
        Row: {
          certificate_number: string | null
          certificate_url: string | null
          coach_profile_id: string
          created_at: string
          expires_at: string | null
          id: string
          payment_intent_id: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by_admin_id: string | null
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          certificate_number?: string | null
          certificate_url?: string | null
          coach_profile_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          payment_intent_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by_admin_id?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          certificate_number?: string | null
          certificate_url?: string | null
          coach_profile_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          payment_intent_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by_admin_id?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dbs_verifications_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dbs_verifications_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dbs_verifications_reviewed_by_admin_id_fkey"
            columns: ["reviewed_by_admin_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          booking_id: string
          created_at: string
          description: string
          dispute_type: string
          id: string
          raised_by_user_id: string
          refund_amount_pence: number | null
          refund_issued: boolean
          resolution: string | null
          resolved_at: string | null
          resolved_by_admin_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          description: string
          dispute_type: string
          id?: string
          raised_by_user_id: string
          refund_amount_pence?: number | null
          refund_issued?: boolean
          resolution?: string | null
          resolved_at?: string | null
          resolved_by_admin_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          description?: string
          dispute_type?: string
          id?: string
          raised_by_user_id?: string
          refund_amount_pence?: number | null
          refund_issued?: boolean
          resolution?: string | null
          resolved_at?: string | null
          resolved_by_admin_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_raised_by_user_id_fkey"
            columns: ["raised_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_admin_id_fkey"
            columns: ["resolved_by_admin_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      group_bookings: {
        Row: {
          coach_profile_id: string
          coach_sport_id: string
          created_at: string
          created_by: string
          currency: string
          current_participants: number
          deleted_at: string | null
          description: string | null
          id: string
          max_participants: number
          price_per_person_pence: number
          session_date: string
          session_end_time: string
          session_start_time: string
          sport_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          coach_profile_id: string
          coach_sport_id: string
          created_at?: string
          created_by: string
          currency?: string
          current_participants?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          max_participants: number
          price_per_person_pence: number
          session_date: string
          session_end_time: string
          session_start_time: string
          sport_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          coach_profile_id?: string
          coach_sport_id?: string
          created_at?: string
          created_by?: string
          currency?: string
          current_participants?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          max_participants?: number
          price_per_person_pence?: number
          session_date?: string
          session_end_time?: string
          session_start_time?: string
          sport_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_bookings_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_bookings_coach_sport_id_fkey"
            columns: ["coach_sport_id"]
            isOneToOne: false
            referencedRelation: "coach_sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_bookings_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      group_programme_enrolments: {
        Row: {
          block_amount_pence: number | null
          booked_by_user_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          child_profile_id: string | null
          created_at: string
          id: string
          joined_at_session_number: number
          participant_name: string | null
          payment_model: string
          payment_type: string
          player_profile_id: string | null
          programme_id: string
          refund_amount_pence: number | null
          sessions_paid_for: number | null
          status: string
          updated_at: string
        }
        Insert: {
          block_amount_pence?: number | null
          booked_by_user_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          child_profile_id?: string | null
          created_at?: string
          id?: string
          joined_at_session_number?: number
          participant_name?: string | null
          payment_model: string
          payment_type: string
          player_profile_id?: string | null
          programme_id: string
          refund_amount_pence?: number | null
          sessions_paid_for?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          block_amount_pence?: number | null
          booked_by_user_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          child_profile_id?: string | null
          created_at?: string
          id?: string
          joined_at_session_number?: number
          participant_name?: string | null
          payment_model?: string
          payment_type?: string
          player_profile_id?: string | null
          programme_id?: string
          refund_amount_pence?: number | null
          sessions_paid_for?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_programme_enrolments_booked_by_user_id_fkey"
            columns: ["booked_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_programme_enrolments_child_profile_id_fkey"
            columns: ["child_profile_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_programme_enrolments_group_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "group_programmes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_programme_enrolments_player_profile_id_fkey"
            columns: ["player_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_programme_sessions: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          coach_venue_id: string | null
          completed_at: string | null
          created_at: string
          end_time: string
          group_programme_id: string
          id: string
          session_date: string
          slots: Json | null
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          coach_venue_id?: string | null
          completed_at?: string | null
          created_at?: string
          end_time: string
          group_programme_id: string
          id?: string
          session_date: string
          slots?: Json | null
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          coach_venue_id?: string | null
          completed_at?: string | null
          created_at?: string
          end_time?: string
          group_programme_id?: string
          id?: string
          session_date?: string
          slots?: Json | null
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_programme_sessions_coach_venue_id_fkey"
            columns: ["coach_venue_id"]
            isOneToOne: false
            referencedRelation: "coach_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_programme_sessions_group_programme_id_fkey"
            columns: ["group_programme_id"]
            isOneToOne: false
            referencedRelation: "group_programmes"
            referencedColumns: ["id"]
          },
        ]
      }
      group_programmes: {
        Row: {
          age_groups: string[]
          block_price_pence: number | null
          block_session_count: number | null
          camp_mode: boolean
          cancellation_window_hours: number
          coach_profile_id: string
          coach_venue_id: string | null
          created_at: string
          currency: string
          current_spots: number
          day_of_week: number | null
          days_of_week: number[] | null
          deleted_at: string | null
          description: string | null
          duration_minutes: number
          ends_at: string | null
          id: string
          image_url: string | null
          late_joining_allowed: boolean
          max_spots: number
          min_participants: number | null
          model: string
          payment_type: string
          price_per_session_pence: number
          schedule_type: string
          session_count: number | null
          skill_level: string
          sport_id: string
          start_time: string | null
          starts_at: string | null
          status: string
          title: string
          updated_at: string
          venue_address: string | null
          venue_name: string | null
        }
        Insert: {
          age_groups?: string[]
          block_price_pence?: number | null
          block_session_count?: number | null
          camp_mode?: boolean
          cancellation_window_hours?: number
          coach_profile_id: string
          coach_venue_id?: string | null
          created_at?: string
          currency?: string
          current_spots?: number
          day_of_week?: number | null
          days_of_week?: number[] | null
          deleted_at?: string | null
          description?: string | null
          duration_minutes: number
          ends_at?: string | null
          id?: string
          image_url?: string | null
          late_joining_allowed?: boolean
          max_spots: number
          min_participants?: number | null
          model: string
          payment_type: string
          price_per_session_pence: number
          schedule_type: string
          session_count?: number | null
          skill_level: string
          sport_id: string
          start_time?: string | null
          starts_at?: string | null
          status?: string
          title: string
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
        }
        Update: {
          age_groups?: string[]
          block_price_pence?: number | null
          block_session_count?: number | null
          camp_mode?: boolean
          cancellation_window_hours?: number
          coach_profile_id?: string
          coach_venue_id?: string | null
          created_at?: string
          currency?: string
          current_spots?: number
          day_of_week?: number | null
          days_of_week?: number[] | null
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number
          ends_at?: string | null
          id?: string
          image_url?: string | null
          late_joining_allowed?: boolean
          max_spots?: number
          min_participants?: number | null
          model?: string
          payment_type?: string
          price_per_session_pence?: number
          schedule_type?: string
          session_count?: number | null
          skill_level?: string
          sport_id?: string
          start_time?: string | null
          starts_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_programmes_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_programmes_coach_venue_id_fkey"
            columns: ["coach_venue_id"]
            isOneToOne: false
            referencedRelation: "coach_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_programmes_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      interest_registrations: {
        Row: {
          consent_at: string | null
          consent_given: boolean
          created_at: string | null
          email: string
          id: string
          location: string | null
          name: string
          role: string
          sports: string[] | null
        }
        Insert: {
          consent_at?: string | null
          consent_given?: boolean
          created_at?: string | null
          email: string
          id?: string
          location?: string | null
          name: string
          role: string
          sports?: string[] | null
        }
        Update: {
          consent_at?: string | null
          consent_given?: boolean
          created_at?: string | null
          email?: string
          id?: string
          location?: string | null
          name?: string
          role?: string
          sports?: string[] | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_booking_cancelled: boolean
          email_booking_confirmed: boolean
          email_marketing: boolean
          email_payout_processed: boolean
          email_review_reminder: boolean
          email_session_reminder: boolean
          id: string
          onesignal_subscription_id: string | null
          push_booking_cancelled: boolean
          push_booking_confirmed: boolean
          push_marketing: boolean
          push_new_message: boolean
          push_session_reminder: boolean
          sms_enabled: boolean
          updated_at: string
          user_profile_id: string
          whatsapp_enabled: boolean
        }
        Insert: {
          created_at?: string
          email_booking_cancelled?: boolean
          email_booking_confirmed?: boolean
          email_marketing?: boolean
          email_payout_processed?: boolean
          email_review_reminder?: boolean
          email_session_reminder?: boolean
          id?: string
          onesignal_subscription_id?: string | null
          push_booking_cancelled?: boolean
          push_booking_confirmed?: boolean
          push_marketing?: boolean
          push_new_message?: boolean
          push_session_reminder?: boolean
          sms_enabled?: boolean
          updated_at?: string
          user_profile_id: string
          whatsapp_enabled?: boolean
        }
        Update: {
          created_at?: string
          email_booking_cancelled?: boolean
          email_booking_confirmed?: boolean
          email_marketing?: boolean
          email_payout_processed?: boolean
          email_review_reminder?: boolean
          email_session_reminder?: boolean
          id?: string
          onesignal_subscription_id?: string | null
          push_booking_cancelled?: boolean
          push_booking_confirmed?: boolean
          push_marketing?: boolean
          push_new_message?: boolean
          push_session_reminder?: boolean
          sms_enabled?: boolean
          updated_at?: string
          user_profile_id?: string
          whatsapp_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          data: Json | null
          id: string
          is_read: boolean
          read_at: string | null
          title: string
          type: string
          user_profile_id: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          read_at?: string | null
          title: string
          type: string
          user_profile_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          read_at?: string | null
          title?: string
          type?: string
          user_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          preferred_sport_ids: string[] | null
          updated_at: string
          user_profile_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          preferred_sport_ids?: string[] | null
          updated_at?: string
          user_profile_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          preferred_sport_ids?: string[] | null
          updated_at?: string
          user_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_profiles_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      passport_entries: {
        Row: {
          booking_id: string
          child_profile_id: string | null
          coach_basic_notes: string | null
          coach_profile_id: string
          created_at: string
          id: string
          player_profile_id: string | null
          session_date: string
          session_duration_minutes: number
          sport_id: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          child_profile_id?: string | null
          coach_basic_notes?: string | null
          coach_profile_id: string
          created_at?: string
          id?: string
          player_profile_id?: string | null
          session_date: string
          session_duration_minutes: number
          sport_id: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          child_profile_id?: string | null
          coach_basic_notes?: string | null
          coach_profile_id?: string
          created_at?: string
          id?: string
          player_profile_id?: string | null
          session_date?: string
          session_duration_minutes?: number
          sport_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "passport_entries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passport_entries_child_profile_id_fkey"
            columns: ["child_profile_id"]
            isOneToOne: false
            referencedRelation: "child_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passport_entries_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passport_entries_player_profile_id_fkey"
            columns: ["player_profile_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passport_entries_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_intents: {
        Row: {
          amount_pence: number
          application_fee_pence: number
          booking_id: string
          coach_transfer_amount_pence: number
          created_at: string
          currency: string
          id: string
          idempotency_key: string
          status: string
          stripe_error_code: string | null
          stripe_error_message: string | null
          stripe_payment_intent_id: string
          stripe_status: string | null
          updated_at: string
        }
        Insert: {
          amount_pence: number
          application_fee_pence: number
          booking_id: string
          coach_transfer_amount_pence: number
          created_at?: string
          currency?: string
          id?: string
          idempotency_key: string
          status?: string
          stripe_error_code?: string | null
          stripe_error_message?: string | null
          stripe_payment_intent_id: string
          stripe_status?: string | null
          updated_at?: string
        }
        Update: {
          amount_pence?: number
          application_fee_pence?: number
          booking_id?: string
          coach_transfer_amount_pence?: number
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string
          status?: string
          stripe_error_code?: string | null
          stripe_error_message?: string | null
          stripe_payment_intent_id?: string
          stripe_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount_pence: number
          booking_id: string
          coach_profile_id: string
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          processed_at: string | null
          retry_count: number
          scheduled_at: string
          status: string
          stripe_transfer_id: string | null
          updated_at: string
        }
        Insert: {
          amount_pence: number
          booking_id: string
          coach_profile_id: string
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          processed_at?: string | null
          retry_count?: number
          scheduled_at: string
          status?: string
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_pence?: number
          booking_id?: string
          coach_profile_id?: string
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          processed_at?: string | null
          retry_count?: number
          scheduled_at?: string
          status?: string
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reports: {
        Row: {
          areas_to_improve: string | null
          coach_notes: string | null
          coach_profile_id: string
          created_at: string
          drills_homework: string | null
          id: string
          is_shared_with_parent: boolean
          overall_rating: number | null
          passport_entry_id: string
          report_deadline_at: string | null
          strengths: string | null
          updated_at: string
        }
        Insert: {
          areas_to_improve?: string | null
          coach_notes?: string | null
          coach_profile_id: string
          created_at?: string
          drills_homework?: string | null
          id?: string
          is_shared_with_parent?: boolean
          overall_rating?: number | null
          passport_entry_id: string
          report_deadline_at?: string | null
          strengths?: string | null
          updated_at?: string
        }
        Update: {
          areas_to_improve?: string | null
          coach_notes?: string | null
          coach_profile_id?: string
          created_at?: string
          drills_homework?: string | null
          id?: string
          is_shared_with_parent?: boolean
          overall_rating?: number | null
          passport_entry_id?: string
          report_deadline_at?: string | null
          strengths?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_reports_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reports_passport_entry_id_fkey"
            columns: ["passport_entry_id"]
            isOneToOne: false
            referencedRelation: "passport_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_config: {
        Row: {
          child_transition_age: number
          child_transition_window_days: number
          dbs_fee_currency: string
          dbs_verification_fee_pence: number
          default_cancellation_hours: number
          default_commission_rate: number
          default_max_advance_days: number
          default_min_advance_hours: number
          default_payout_delay_hours: number
          id: string
          max_featured_coaches_per_page: number
          performance_report_window_hours: number
          updated_at: string
        }
        Insert: {
          child_transition_age?: number
          child_transition_window_days?: number
          dbs_fee_currency?: string
          dbs_verification_fee_pence?: number
          default_cancellation_hours?: number
          default_commission_rate?: number
          default_max_advance_days?: number
          default_min_advance_hours?: number
          default_payout_delay_hours?: number
          id?: string
          max_featured_coaches_per_page?: number
          performance_report_window_hours?: number
          updated_at?: string
        }
        Update: {
          child_transition_age?: number
          child_transition_window_days?: number
          dbs_fee_currency?: string
          dbs_verification_fee_pence?: number
          default_cancellation_hours?: number
          default_commission_rate?: number
          default_max_advance_days?: number
          default_min_advance_hours?: number
          default_payout_delay_hours?: number
          id?: string
          max_featured_coaches_per_page?: number
          performance_report_window_hours?: number
          updated_at?: string
        }
        Relationships: []
      }
      player_profiles: {
        Row: {
          created_at: string
          date_of_birth: string
          deleted_at: string | null
          id: string
          medical_notes: string | null
          passport_privacy: string
          skill_level: string
          sport_ids: string[]
          updated_at: string
          user_profile_id: string
        }
        Insert: {
          created_at?: string
          date_of_birth: string
          deleted_at?: string | null
          id?: string
          medical_notes?: string | null
          passport_privacy?: string
          skill_level: string
          sport_ids: string[]
          updated_at?: string
          user_profile_id: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string
          deleted_at?: string | null
          id?: string
          medical_notes?: string | null
          passport_privacy?: string
          skill_level?: string
          sport_ids?: string[]
          updated_at?: string
          user_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_profiles_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          currency: string | null
          current_uses: number
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          max_uses: number | null
          min_booking_value_pence: number | null
          sport_id: string | null
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string | null
          current_uses?: number
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_booking_value_pence?: number | null
          sport_id?: string | null
          updated_at?: string
          valid_from: string
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string | null
          current_uses?: number
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_booking_value_pence?: number | null
          sport_id?: string | null
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      qualification_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          issuing_body: string
          name: string
          sort_order: number
          sport_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          issuing_body: string
          name: string
          sort_order?: number
          sport_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          issuing_body?: string
          name?: string
          sort_order?: number
          sport_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qualification_types_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount_pence: number
          booking_id: string
          created_at: string
          currency: string
          id: string
          initiated_by: string
          payment_intent_id: string
          processed_at: string | null
          reason: string
          status: string
          stripe_refund_id: string | null
          updated_at: string
        }
        Insert: {
          amount_pence: number
          booking_id: string
          created_at?: string
          currency?: string
          id?: string
          initiated_by: string
          payment_intent_id: string
          processed_at?: string | null
          reason: string
          status?: string
          stripe_refund_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_pence?: number
          booking_id?: string
          created_at?: string
          currency?: string
          id?: string
          initiated_by?: string
          payment_intent_id?: string
          processed_at?: string | null
          reason?: string
          status?: string
          stripe_refund_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          booking_id: string | null
          coach_profile_id: string
          comment: string | null
          created_at: string
          id: string
          is_visible: boolean
          rating: number
          reviewer_name: string
          reviewer_user_id: string | null
          sport_name: string
        }
        Insert: {
          booking_id?: string | null
          coach_profile_id: string
          comment?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          rating: number
          reviewer_name?: string
          reviewer_user_id?: string | null
          sport_name?: string
        }
        Update: {
          booking_id?: string | null
          coach_profile_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          rating?: number
          reviewer_name?: string
          reviewer_user_id?: string | null
          sport_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_notes: {
        Row: {
          booking_id: string
          coach_profile_id: string
          created_at: string
          id: string
          is_shared_with_parent: boolean
          notes: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          coach_profile_id: string
          created_at?: string
          id?: string
          is_shared_with_parent?: boolean
          notes: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          coach_profile_id?: string
          created_at?: string
          id?: string
          is_shared_with_parent?: boolean
          notes?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_notes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_notes_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sports: {
        Row: {
          created_at: string
          icon_url: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      subscription_tiers: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          price_annual_pence: number
          price_monthly_pence: number
          slug: string
          sort_order: number
          stripe_annual_price_id: string | null
          stripe_monthly_price_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          price_annual_pence?: number
          price_monthly_pence?: number
          slug: string
          sort_order?: number
          stripe_annual_price_id?: string | null
          stripe_monthly_price_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          price_annual_pence?: number
          price_monthly_pence?: number
          slug?: string
          sort_order?: number
          stripe_annual_price_id?: string | null
          stripe_monthly_price_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tier_features: {
        Row: {
          created_at: string
          feature_key: string
          id: string
          is_enabled: boolean
          tier_id: string
          updated_at: string
          usage_limit: number | null
        }
        Insert: {
          created_at?: string
          feature_key: string
          id?: string
          is_enabled?: boolean
          tier_id: string
          updated_at?: string
          usage_limit?: number | null
        }
        Update: {
          created_at?: string
          feature_key?: string
          id?: string
          is_enabled?: boolean
          tier_id?: string
          updated_at?: string
          usage_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tier_features_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "subscription_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_usage: {
        Row: {
          coach_profile_id: string
          created_at: string
          feature_key: string
          id: string
          updated_at: string
          usage_count: number
          usage_month: string
        }
        Insert: {
          coach_profile_id: string
          created_at?: string
          feature_key: string
          id?: string
          updated_at?: string
          usage_count?: number
          usage_month: string
        }
        Update: {
          coach_profile_id?: string
          created_at?: string
          feature_key?: string
          id?: string
          updated_at?: string
          usage_count?: number
          usage_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier_usage_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          active_role: string | null
          auth_provider: string
          auth_user_id: string | null
          avatar_url: string | null
          country_code: string
          created_at: string
          deleted_at: string | null
          deletion_requested_at: string | null
          full_name: string
          id: string
          is_provisional: boolean
          location_city: string | null
          location_lat: number | null
          location_lng: number | null
          location_postcode: string | null
          phone: string | null
          provisional_until: string | null
          terms_accepted_at: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          active_role?: string | null
          auth_provider?: string
          auth_user_id?: string | null
          avatar_url?: string | null
          country_code?: string
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          full_name: string
          id?: string
          is_provisional?: boolean
          location_city?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_postcode?: string | null
          phone?: string | null
          provisional_until?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          active_role?: string | null
          auth_provider?: string
          auth_user_id?: string | null
          avatar_url?: string | null
          country_code?: string
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          full_name?: string
          id?: string
          is_provisional?: boolean
          location_city?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_postcode?: string | null
          phone?: string | null
          provisional_until?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          role: string
          updated_at: string
          user_profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          role: string
          updated_at?: string
          user_profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
          user_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_emails: {
        Row: {
          consent_at: string | null
          consent_given: boolean
          created_at: string | null
          email: string
          id: string
          role: string | null
        }
        Insert: {
          consent_at?: string | null
          consent_given?: boolean
          created_at?: string | null
          email: string
          id?: string
          role?: string | null
        }
        Update: {
          consent_at?: string | null
          consent_given?: boolean
          created_at?: string | null
          email?: string
          id?: string
          role?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      user_profile_has_live_coach: {
        Args: { target_user_profile_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

