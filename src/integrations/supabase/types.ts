export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
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
      ai_insights: {
        Row: {
          content: string
          date: string
          id: string
          insight_type: string
          last_updated: string | null
          user_id: string
        }
        Insert: {
          content: string
          date: string
          id?: string
          insight_type?: string
          last_updated?: string | null
          user_id: string
        }
        Update: {
          content?: string
          date?: string
          id?: string
          insight_type?: string
          last_updated?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_response_cache: {
        Row: {
          cache_key: string
          created_at: string | null
          expires_at: string | null
          hit_count: number | null
          id: string
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          response: string
        }
        Insert: {
          cache_key: string
          created_at?: string | null
          expires_at?: string | null
          hit_count?: number | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          response: string
        }
        Update: {
          cache_key?: string
          created_at?: string | null
          expires_at?: string | null
          hit_count?: number | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          response?: string
        }
        Relationships: []
      }
      api_usage_log: {
        Row: {
          cache_creation_input_tokens: number | null
          cache_hit: boolean | null
          cache_read_input_tokens: number | null
          cost_usd: number | null
          created_at: string | null
          function_name: string | null
          id: string
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          user_id: string | null
        }
        Insert: {
          cache_creation_input_tokens?: number | null
          cache_hit?: boolean | null
          cache_read_input_tokens?: number | null
          cost_usd?: number | null
          created_at?: string | null
          function_name?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          cache_creation_input_tokens?: number | null
          cache_hit?: boolean | null
          cache_read_input_tokens?: number | null
          cost_usd?: number | null
          created_at?: string | null
          function_name?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      athlete_academics: {
        Row: {
          academic_interests: string | null
          act_score: number | null
          class_rank_denominator: number | null
          class_rank_numerator: number | null
          created_at: string | null
          gpa: number | null
          gpa_weighted: boolean | null
          id: string
          intended_major: string | null
          psat_score: number | null
          sat_score: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          academic_interests?: string | null
          act_score?: number | null
          class_rank_denominator?: number | null
          class_rank_numerator?: number | null
          created_at?: string | null
          gpa?: number | null
          gpa_weighted?: boolean | null
          id?: string
          intended_major?: string | null
          psat_score?: number | null
          sat_score?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          academic_interests?: string | null
          act_score?: number | null
          class_rank_denominator?: number | null
          class_rank_numerator?: number | null
          created_at?: string | null
          gpa?: number | null
          gpa_weighted?: boolean | null
          id?: string
          intended_major?: string | null
          psat_score?: number | null
          sat_score?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_academics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_profiles: {
        Row: {
          ai_summary: string | null
          ai_summary_updated_at: string | null
          avatar_url: string | null
          bio: string | null
          club_team: string | null
          coach_view_count: number | null
          contact_email: string | null
          created_at: string | null
          division_interest: string | null
          gpa: number | null
          grad_year: number | null
          highlight_video_url: string | null
          id: string
          intended_major: string | null
          is_public: boolean | null
          is_recruiting: boolean | null
          last_concept2_sync: string | null
          location: string | null
          personal_facts: Json | null
          personal_statement: string | null
          school: string | null
          show_on_team_portal: boolean | null
          social_links: Json | null
          updated_at: string | null
          user_id: string
          view_count: number | null
        }
        Insert: {
          ai_summary?: string | null
          ai_summary_updated_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          club_team?: string | null
          coach_view_count?: number | null
          contact_email?: string | null
          created_at?: string | null
          division_interest?: string | null
          gpa?: number | null
          grad_year?: number | null
          highlight_video_url?: string | null
          id?: string
          intended_major?: string | null
          is_public?: boolean | null
          is_recruiting?: boolean | null
          last_concept2_sync?: string | null
          location?: string | null
          personal_facts?: Json | null
          personal_statement?: string | null
          school?: string | null
          show_on_team_portal?: boolean | null
          social_links?: Json | null
          updated_at?: string | null
          user_id: string
          view_count?: number | null
        }
        Update: {
          ai_summary?: string | null
          ai_summary_updated_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          club_team?: string | null
          coach_view_count?: number | null
          contact_email?: string | null
          created_at?: string | null
          division_interest?: string | null
          gpa?: number | null
          grad_year?: number | null
          highlight_video_url?: string | null
          id?: string
          intended_major?: string | null
          is_public?: boolean | null
          is_recruiting?: boolean | null
          last_concept2_sync?: string | null
          location?: string | null
          personal_facts?: Json | null
          personal_statement?: string | null
          school?: string | null
          show_on_team_portal?: boolean | null
          social_links?: Json | null
          updated_at?: string | null
          user_id?: string
          view_count?: number | null
        }
        Relationships: []
      }
      attendance: {
        Row: {
          created_at: string | null
          date: string
          id: string
          marked_by: string | null
          notes: string | null
          status: string
          team_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date?: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          status?: string
          team_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          status?: string
          team_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          resource_id: string | null
          resource_type: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      boat_lineups: {
        Row: {
          ai_rationale: string | null
          ai_suggestion_used: boolean | null
          boat_class: string
          boat_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          practice_date: string | null
          practice_start_time: string | null
          published_at: string | null
          season_id: string | null
          seats: Json
          status: string | null
          team_id: string | null
          updated_at: string | null
          workout_plan: string | null
        }
        Insert: {
          ai_rationale?: string | null
          ai_suggestion_used?: boolean | null
          boat_class: string
          boat_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          practice_date?: string | null
          practice_start_time?: string | null
          published_at?: string | null
          season_id?: string | null
          seats?: Json
          status?: string | null
          team_id?: string | null
          updated_at?: string | null
          workout_plan?: string | null
        }
        Update: {
          ai_rationale?: string | null
          ai_suggestion_used?: boolean | null
          boat_class?: string
          boat_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          practice_date?: string | null
          practice_start_time?: string | null
          published_at?: string | null
          season_id?: string | null
          seats?: Json
          status?: string | null
          team_id?: string | null
          updated_at?: string | null
          workout_plan?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "boat_lineups_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "team_boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boat_lineups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boat_lineups_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "team_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boat_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      c2_connections: {
        Row: {
          access_token: string
          c2_user_id: string
          created_at: string
          id: string
          last_sync_at: string | null
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          c2_user_id: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          c2_user_id?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      challenge_entries: {
        Row: {
          challenge_id: string
          created_at: string
          display_value: string | null
          id: string
          points: number | null
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          challenge_id: string
          created_at?: string
          display_value?: string | null
          id?: string
          points?: number | null
          updated_at?: string
          user_id: string
          value: number
        }
        Update: {
          challenge_id?: string
          created_at?: string
          display_value?: string | null
          id?: string
          points?: number | null
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "challenge_entries_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "weekly_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      claimed_results: {
        Row: {
          created_at: string | null
          crew: Json | null
          entry_id: string | null
          event_name: string
          finish_time: string | null
          id: string
          placement: number | null
          regatta_id: string
          result_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          crew?: Json | null
          entry_id?: string | null
          event_name: string
          finish_time?: string | null
          id?: string
          placement?: number | null
          regatta_id: string
          result_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          crew?: Json | null
          entry_id?: string | null
          event_name?: string
          finish_time?: string | null
          id?: string
          placement?: number | null
          regatta_id?: string
          result_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claimed_results_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "regatta_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claimed_results_regatta_id_fkey"
            columns: ["regatta_id"]
            isOneToOne: false
            referencedRelation: "regattas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claimed_results_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "regatta_results"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          cached_at: string | null
          club_type: string | null
          created_at: string | null
          external_id: string | null
          id: string
          location: string | null
          name: string
          rc_url: string | null
          state: string | null
        }
        Insert: {
          cached_at?: string | null
          club_type?: string | null
          created_at?: string | null
          external_id?: string | null
          id?: string
          location?: string | null
          name: string
          rc_url?: string | null
          state?: string | null
        }
        Update: {
          cached_at?: string | null
          club_type?: string | null
          created_at?: string | null
          external_id?: string | null
          id?: string
          location?: string | null
          name?: string
          rc_url?: string | null
          state?: string | null
        }
        Relationships: []
      }
      coach_ai_messages: {
        Row: {
          coach_id: string
          content: string
          created_at: string | null
          id: string
          role: string
          team_id: string
        }
        Insert: {
          coach_id: string
          content: string
          created_at?: string | null
          id?: string
          role: string
          team_id: string
        }
        Update: {
          coach_id?: string
          content?: string
          created_at?: string | null
          id?: string
          role?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_ai_messages_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_ai_messages_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_athlete_messages: {
        Row: {
          content: string
          created_at: string
          group_label: string | null
          group_type: string
          id: string
          parent_visible: boolean
          recipient_athlete_id: string | null
          sender_id: string
          team_id: string
        }
        Insert: {
          content: string
          created_at?: string
          group_label?: string | null
          group_type?: string
          id?: string
          parent_visible?: boolean
          recipient_athlete_id?: string | null
          sender_id: string
          team_id: string
        }
        Update: {
          content?: string
          created_at?: string
          group_label?: string | null
          group_type?: string
          id?: string
          parent_visible?: boolean
          recipient_athlete_id?: string | null
          sender_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_athlete_messages_recipient_athlete_id_fkey"
            columns: ["recipient_athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_athlete_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_athlete_messages_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          team_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: string
          team_id: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          team_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      college_targets: {
        Row: {
          created_at: string | null
          division: string
          fit_notes: string | null
          fit_score: string | null
          id: string
          improve_notes: string | null
          school_name: string
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          division: string
          fit_notes?: string | null
          fit_score?: string | null
          id?: string
          improve_notes?: string | null
          school_name: string
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          division?: string
          fit_notes?: string | null
          fit_score?: string | null
          id?: string
          improve_notes?: string | null
          school_name?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      combine_entries: {
        Row: {
          bench_press_kg: number | null
          combine_score: number | null
          deadlift_kg: number | null
          gender: string | null
          grad_year: number | null
          id: string
          notes: string | null
          six_k_seconds: number | null
          six_k_watts: number | null
          squat_kg: number | null
          submitted_at: string
          two_k_seconds: number | null
          two_k_watts: number | null
          updated_at: string
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          bench_press_kg?: number | null
          combine_score?: number | null
          deadlift_kg?: number | null
          gender?: string | null
          grad_year?: number | null
          id?: string
          notes?: string | null
          six_k_seconds?: number | null
          six_k_watts?: number | null
          squat_kg?: number | null
          submitted_at?: string
          two_k_seconds?: number | null
          two_k_watts?: number | null
          updated_at?: string
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          bench_press_kg?: number | null
          combine_score?: number | null
          deadlift_kg?: number | null
          gender?: string | null
          grad_year?: number | null
          id?: string
          notes?: string | null
          six_k_seconds?: number | null
          six_k_watts?: number | null
          squat_kg?: number | null
          submitted_at?: string
          two_k_seconds?: number | null
          two_k_watts?: number | null
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "combine_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      concept2_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          expires_at: string | null
          id: string
          last_sync_at: string | null
          refresh_token: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_sync_at?: string | null
          refresh_token?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_sync_at?: string | null
          refresh_token?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      cox_technical_ratings: {
        Row: {
          bladework: number | null
          created_at: string | null
          drive_length: number | null
          focus: number | null
          id: string
          notes: string | null
          rated_by: string | null
          session_id: string
          set_and_balance: number | null
          team_id: string
          timing: number | null
        }
        Insert: {
          bladework?: number | null
          created_at?: string | null
          drive_length?: number | null
          focus?: number | null
          id?: string
          notes?: string | null
          rated_by?: string | null
          session_id: string
          set_and_balance?: number | null
          team_id: string
          timing?: number | null
        }
        Update: {
          bladework?: number | null
          created_at?: string | null
          drive_length?: number | null
          focus?: number | null
          id?: string
          notes?: string | null
          rated_by?: string | null
          session_id?: string
          set_and_balance?: number | null
          team_id?: string
          timing?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cox_technical_ratings_rated_by_fkey"
            columns: ["rated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cox_technical_ratings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "practice_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cox_technical_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      cross_training: {
        Row: {
          activity_type: string
          calories: number | null
          created_at: string | null
          date: string
          distance: number | null
          distance_meters: number | null
          distance_unit: string
          duration_minutes: number | null
          duration_seconds: number | null
          heart_rate_average: number | null
          heart_rate_max: number | null
          id: string
          notes: string | null
          source: string | null
          user_id: string
        }
        Insert: {
          activity_type: string
          calories?: number | null
          created_at?: string | null
          date?: string
          distance?: number | null
          distance_meters?: number | null
          distance_unit?: string
          duration_minutes?: number | null
          duration_seconds?: number | null
          heart_rate_average?: number | null
          heart_rate_max?: number | null
          id?: string
          notes?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          calories?: number | null
          created_at?: string | null
          date?: string
          distance?: number | null
          distance_meters?: number | null
          distance_unit?: string
          duration_minutes?: number | null
          duration_seconds?: number | null
          heart_rate_average?: number | null
          heart_rate_max?: number | null
          id?: string
          notes?: string | null
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      custom_foods: {
        Row: {
          calories_per_100g: number
          carbs_per_100g: number | null
          created_at: string
          default_serving_size: number | null
          default_serving_unit: string | null
          fat_per_100g: number | null
          food_name: string
          id: string
          protein_per_100g: number | null
          user_id: string
        }
        Insert: {
          calories_per_100g?: number
          carbs_per_100g?: number | null
          created_at?: string
          default_serving_size?: number | null
          default_serving_unit?: string | null
          fat_per_100g?: number | null
          food_name: string
          id?: string
          protein_per_100g?: number | null
          user_id: string
        }
        Update: {
          calories_per_100g?: number
          carbs_per_100g?: number | null
          created_at?: string
          default_serving_size?: number | null
          default_serving_unit?: string | null
          fat_per_100g?: number | null
          food_name?: string
          id?: string
          protein_per_100g?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_foods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_ai_usage: {
        Row: {
          created_at: string | null
          date: string
          id: string
          total_calls: number | null
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          total_calls?: number | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          total_calls?: number | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_motivations: {
        Row: {
          category: string
          created_at: string | null
          id: string
          message: string
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          message: string
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          message?: string
        }
        Relationships: []
      }
      daily_nutrition_summary: {
        Row: {
          completed: boolean
          created_at: string
          date: string
          goal_calories: number
          goal_carbs: number
          goal_fat: number
          goal_protein: number
          id: string
          total_calories: number
          total_carbs: number
          total_fat: number
          total_protein: number
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          date: string
          goal_calories?: number
          goal_carbs?: number
          goal_fat?: number
          goal_protein?: number
          id?: string
          total_calories?: number
          total_carbs?: number
          total_fat?: number
          total_protein?: number
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          date?: string
          goal_calories?: number
          goal_carbs?: number
          goal_fat?: number
          goal_protein?: number
          id?: string
          total_calories?: number
          total_carbs?: number
          total_fat?: number
          total_protein?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_nutrition_summary_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      data_requests: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          request_type: string
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          request_type: string
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          request_type?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      default_strength_programs: {
        Row: {
          created_at: string | null
          days_per_week: number | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          program_data: Json | null
        }
        Insert: {
          created_at?: string | null
          days_per_week?: number | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          program_data?: Json | null
        }
        Update: {
          created_at?: string | null
          days_per_week?: number | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          program_data?: Json | null
        }
        Relationships: []
      }
      default_training_philosophy: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          system_prompt: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          system_prompt?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          system_prompt?: string | null
        }
        Relationships: []
      }
      deleted_c2_workouts: {
        Row: {
          deleted_at: string | null
          external_id: string
          id: string
          user_id: string
        }
        Insert: {
          deleted_at?: string | null
          external_id: string
          id?: string
          user_id: string
        }
        Update: {
          deleted_at?: string | null
          external_id?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          read: boolean | null
          recipient_id: string
          sender_id: string
          team_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          read?: boolean | null
          recipient_id: string
          sender_id: string
          team_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          read?: boolean | null
          recipient_id?: string
          sender_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          condition: number
          created_at: string
          id: string
          is_flagged: boolean
          last_maintenance: string | null
          name: string
          next_maintenance: string | null
          notes: string | null
          org_id: string
          team_id: string | null
          type: string
        }
        Insert: {
          condition?: number
          created_at?: string
          id?: string
          is_flagged?: boolean
          last_maintenance?: string | null
          name: string
          next_maintenance?: string | null
          notes?: string | null
          org_id: string
          team_id?: string | null
          type: string
        }
        Update: {
          condition?: number
          created_at?: string
          id?: string
          is_flagged?: boolean
          last_maintenance?: string | null
          name?: string
          next_maintenance?: string | null
          notes?: string | null
          org_id?: string
          team_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      erg_assignment_pieces: {
        Row: {
          assignment_id: string
          distance: number | null
          duration_seconds: number | null
          id: string
          notes: string | null
          piece_number: number
          piece_type: string
          rest_seconds: number | null
          target_split_offset_seconds: number | null
          target_split_seconds: number | null
          target_split_type: string
          target_stroke_rate: number | null
        }
        Insert: {
          assignment_id: string
          distance?: number | null
          duration_seconds?: number | null
          id?: string
          notes?: string | null
          piece_number: number
          piece_type: string
          rest_seconds?: number | null
          target_split_offset_seconds?: number | null
          target_split_seconds?: number | null
          target_split_type?: string
          target_stroke_rate?: number | null
        }
        Update: {
          assignment_id?: string
          distance?: number | null
          duration_seconds?: number | null
          id?: string
          notes?: string | null
          piece_number?: number
          piece_type?: string
          rest_seconds?: number | null
          target_split_offset_seconds?: number | null
          target_split_seconds?: number | null
          target_split_type?: string
          target_stroke_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "erg_assignment_pieces_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "erg_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      erg_assignment_results: {
        Row: {
          assignment_id: string
          athlete_id: string
          completed_at: string | null
          completion_notes: string | null
          created_at: string | null
          erg_score_id: string | null
          id: string
          logged_by_role: string | null
          logged_by_user_id: string | null
          manual_pieces: Json | null
          status: string | null
        }
        Insert: {
          assignment_id: string
          athlete_id: string
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string | null
          erg_score_id?: string | null
          id?: string
          logged_by_role?: string | null
          logged_by_user_id?: string | null
          manual_pieces?: Json | null
          status?: string | null
        }
        Update: {
          assignment_id?: string
          athlete_id?: string
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string | null
          erg_score_id?: string | null
          id?: string
          logged_by_role?: string | null
          logged_by_user_id?: string | null
          manual_pieces?: Json | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erg_assignment_results_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "erg_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erg_assignment_results_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erg_assignment_results_erg_score_id_fkey"
            columns: ["erg_score_id"]
            isOneToOne: false
            referencedRelation: "erg_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erg_assignment_results_logged_by_user_id_fkey"
            columns: ["logged_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erg_assignments: {
        Row: {
          assigned_to: Json | null
          coach_id: string
          created_at: string | null
          deadline: string | null
          description: string | null
          id: string
          notes: string | null
          pieces: Json | null
          scheduled_date: string | null
          status: string | null
          team_id: string
          title: string
          video_url: string | null
        }
        Insert: {
          assigned_to?: Json | null
          coach_id: string
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          pieces?: Json | null
          scheduled_date?: string | null
          status?: string | null
          team_id: string
          title: string
          video_url?: string | null
        }
        Update: {
          assigned_to?: Json | null
          coach_id?: string
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          pieces?: Json | null
          scheduled_date?: string | null
          status?: string | null
          team_id?: string
          title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erg_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erg_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      erg_number_assignments: {
        Row: {
          assignment_id: string | null
          athlete_id: string
          coach_id: string
          created_at: string | null
          date: string
          erg_number: string
          id: string
          team_id: string
        }
        Insert: {
          assignment_id?: string | null
          athlete_id: string
          coach_id: string
          created_at?: string | null
          date: string
          erg_number: string
          id?: string
          team_id: string
        }
        Update: {
          assignment_id?: string | null
          athlete_id?: string
          coach_id?: string
          created_at?: string | null
          date?: string
          erg_number?: string
          id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erg_number_assignments_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "erg_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erg_number_assignments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erg_number_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erg_number_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      erg_scores: {
        Row: {
          avg_split_seconds: number | null
          created_at: string | null
          created_by: string | null
          id: string
          is_verified: boolean
          notes: string | null
          recorded_at: string
          source: string | null
          team_id: string | null
          test_type: string
          time_seconds: number | null
          to_leaderboard: boolean
          total_meters: number | null
          user_id: string | null
          watts: number | null
          watts_per_kg: number | null
        }
        Insert: {
          avg_split_seconds?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_verified?: boolean
          notes?: string | null
          recorded_at?: string
          source?: string | null
          team_id?: string | null
          test_type: string
          time_seconds?: number | null
          to_leaderboard?: boolean
          total_meters?: number | null
          user_id?: string | null
          watts?: number | null
          watts_per_kg?: number | null
        }
        Update: {
          avg_split_seconds?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_verified?: boolean
          notes?: string | null
          recorded_at?: string
          source?: string | null
          team_id?: string | null
          test_type?: string
          time_seconds?: number | null
          to_leaderboard?: boolean
          total_meters?: number | null
          user_id?: string | null
          watts?: number | null
          watts_per_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "erg_scores_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erg_scores_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erg_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erg_workout_splits: {
        Row: {
          avg_stroke_rate: number | null
          cal_per_hour: number | null
          calories: number | null
          created_at: string | null
          distance: number | null
          drag_factor: number | null
          finish: boolean | null
          heart_rate_avg: number | null
          heart_rate_max: number | null
          heart_rate_min: number | null
          id: string
          pace_deciseconds: number | null
          rest_time_seconds: number | null
          split_number: number
          stroke_rate: number | null
          time_seconds: number | null
          workout_id: string
        }
        Insert: {
          avg_stroke_rate?: number | null
          cal_per_hour?: number | null
          calories?: number | null
          created_at?: string | null
          distance?: number | null
          drag_factor?: number | null
          finish?: boolean | null
          heart_rate_avg?: number | null
          heart_rate_max?: number | null
          heart_rate_min?: number | null
          id?: string
          pace_deciseconds?: number | null
          rest_time_seconds?: number | null
          split_number: number
          stroke_rate?: number | null
          time_seconds?: number | null
          workout_id: string
        }
        Update: {
          avg_stroke_rate?: number | null
          cal_per_hour?: number | null
          calories?: number | null
          created_at?: string | null
          distance?: number | null
          drag_factor?: number | null
          finish?: boolean | null
          heart_rate_avg?: number | null
          heart_rate_max?: number | null
          heart_rate_min?: number | null
          id?: string
          pace_deciseconds?: number | null
          rest_time_seconds?: number | null
          split_number?: number
          stroke_rate?: number | null
          time_seconds?: number | null
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erg_workout_splits_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "erg_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      erg_workouts: {
        Row: {
          avg_heart_rate: number | null
          avg_split: string | null
          avg_watts: number | null
          cal_hour: number | null
          calories: number | null
          calories_total: number | null
          cooldown_duration: string | null
          created_at: string | null
          detail_fetched_at: string | null
          distance: number | null
          drag_factor: number | null
          duration: string | null
          elapsed_time: number | null
          external_id: string | null
          force_curves: Json | null
          heart_rate_average: number | null
          heart_rate_max: number | null
          heart_rate_min: number | null
          id: string
          intervals: Json | null
          max_heart_rate: number | null
          max_watts: number | null
          min_heart_rate: number | null
          notes: string | null
          real_time_data: Json | null
          rest_distance: number | null
          rest_periods: string | null
          rest_time_seconds: number | null
          session_id: string | null
          split_best: string | null
          stroke_count: number | null
          stroke_data: Json | null
          stroke_rate: number | null
          stroke_rate_average: number | null
          time_formatted: string | null
          user_id: string
          warmup_duration: string | null
          work_per_stroke: number | null
          workout_data: Json | null
          workout_date: string
          workout_type: string
        }
        Insert: {
          avg_heart_rate?: number | null
          avg_split?: string | null
          avg_watts?: number | null
          cal_hour?: number | null
          calories?: number | null
          calories_total?: number | null
          cooldown_duration?: string | null
          created_at?: string | null
          detail_fetched_at?: string | null
          distance?: number | null
          drag_factor?: number | null
          duration?: string | null
          elapsed_time?: number | null
          external_id?: string | null
          force_curves?: Json | null
          heart_rate_average?: number | null
          heart_rate_max?: number | null
          heart_rate_min?: number | null
          id?: string
          intervals?: Json | null
          max_heart_rate?: number | null
          max_watts?: number | null
          min_heart_rate?: number | null
          notes?: string | null
          real_time_data?: Json | null
          rest_distance?: number | null
          rest_periods?: string | null
          rest_time_seconds?: number | null
          session_id?: string | null
          split_best?: string | null
          stroke_count?: number | null
          stroke_data?: Json | null
          stroke_rate?: number | null
          stroke_rate_average?: number | null
          time_formatted?: string | null
          user_id: string
          warmup_duration?: string | null
          work_per_stroke?: number | null
          workout_data?: Json | null
          workout_date?: string
          workout_type: string
        }
        Update: {
          avg_heart_rate?: number | null
          avg_split?: string | null
          avg_watts?: number | null
          cal_hour?: number | null
          calories?: number | null
          calories_total?: number | null
          cooldown_duration?: string | null
          created_at?: string | null
          detail_fetched_at?: string | null
          distance?: number | null
          drag_factor?: number | null
          duration?: string | null
          elapsed_time?: number | null
          external_id?: string | null
          force_curves?: Json | null
          heart_rate_average?: number | null
          heart_rate_max?: number | null
          heart_rate_min?: number | null
          id?: string
          intervals?: Json | null
          max_heart_rate?: number | null
          max_watts?: number | null
          min_heart_rate?: number | null
          notes?: string | null
          real_time_data?: Json | null
          rest_distance?: number | null
          rest_periods?: string | null
          rest_time_seconds?: number | null
          session_id?: string | null
          split_best?: string | null
          stroke_count?: number | null
          stroke_data?: Json | null
          stroke_rate?: number | null
          stroke_rate_average?: number | null
          time_formatted?: string | null
          user_id?: string
          warmup_duration?: string | null
          work_per_stroke?: number | null
          workout_data?: Json | null
          workout_date?: string
          workout_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "erg_workouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_foods: {
        Row: {
          created_at: string
          food_data: Json
          food_name: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          food_data?: Json
          food_name: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          food_data?: Json
          food_name?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_foods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      food_cache: {
        Row: {
          cached_at: string
          id: string
          query: string
          results: Json
        }
        Insert: {
          cached_at?: string
          id?: string
          query: string
          results: Json
        }
        Update: {
          cached_at?: string
          id?: string
          query?: string
          results?: Json
        }
        Relationships: []
      }
      food_log: {
        Row: {
          brand: string | null
          calories: number
          carbs: number | null
          created_at: string
          date: string
          fat: number | null
          fiber: number | null
          food_data_id: string | null
          food_name: string
          id: string
          meal_type: string
          protein: number | null
          serving_quantity: number | null
          serving_size: number | null
          serving_unit: string | null
          source: string | null
          sugar: number | null
          user_id: string
        }
        Insert: {
          brand?: string | null
          calories?: number
          carbs?: number | null
          created_at?: string
          date?: string
          fat?: number | null
          fiber?: number | null
          food_data_id?: string | null
          food_name: string
          id?: string
          meal_type: string
          protein?: number | null
          serving_quantity?: number | null
          serving_size?: number | null
          serving_unit?: string | null
          source?: string | null
          sugar?: number | null
          user_id: string
        }
        Update: {
          brand?: string | null
          calories?: number
          carbs?: number | null
          created_at?: string
          date?: string
          fat?: number | null
          fiber?: number | null
          food_data_id?: string | null
          food_name?: string
          id?: string
          meal_type?: string
          protein?: number | null
          serving_quantity?: number | null
          serving_size?: number | null
          serving_unit?: string | null
          source?: string | null
          sugar?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          last_post_at: string | null
          name: string
          post_count: number | null
          topic_count: number | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          last_post_at?: string | null
          name: string
          post_count?: number | null
          topic_count?: number | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          last_post_at?: string | null
          name?: string
          post_count?: number | null
          topic_count?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      forum_posts: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          images: string[] | null
          is_edited: boolean | null
          parent_post_id: string | null
          topic_id: string
          updated_at: string
          upvote_count: number | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          images?: string[] | null
          is_edited?: boolean | null
          parent_post_id?: string | null
          topic_id: string
          updated_at?: string
          upvote_count?: number | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          images?: string[] | null
          is_edited?: boolean | null
          parent_post_id?: string | null
          topic_id?: string
          updated_at?: string
          upvote_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "forum_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_posts_parent_post_id_fkey"
            columns: ["parent_post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_posts_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "forum_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_topics: {
        Row: {
          author_id: string
          category_id: string
          content: string
          created_at: string
          id: string
          is_locked: boolean | null
          is_pinned: boolean | null
          last_post_at: string | null
          last_post_author_id: string | null
          reply_count: number | null
          title: string
          updated_at: string
          upvote_count: number | null
          view_count: number | null
        }
        Insert: {
          author_id: string
          category_id: string
          content: string
          created_at?: string
          id?: string
          is_locked?: boolean | null
          is_pinned?: boolean | null
          last_post_at?: string | null
          last_post_author_id?: string | null
          reply_count?: number | null
          title: string
          updated_at?: string
          upvote_count?: number | null
          view_count?: number | null
        }
        Update: {
          author_id?: string
          category_id?: string
          content?: string
          created_at?: string
          id?: string
          is_locked?: boolean | null
          is_pinned?: boolean | null
          last_post_at?: string | null
          last_post_author_id?: string | null
          reply_count?: number | null
          title?: string
          updated_at?: string
          upvote_count?: number | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "forum_topics_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_topics_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "forum_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_topics_last_post_author_id_fkey"
            columns: ["last_post_author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_votes: {
        Row: {
          created_at: string
          id: string
          post_id: string | null
          topic_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id?: string | null
          topic_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string | null
          topic_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_votes_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "forum_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_invites: {
        Row: {
          created_at: string
          id: string
          invitee_email: string
          inviter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          invitee_email: string
          inviter_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          invitee_email?: string
          inviter_id?: string
          status?: string
        }
        Relationships: []
      }
      friend_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          receiver_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          receiver_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          receiver_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string | null
          friend_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          friend_id: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          friend_id?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      healthkit_heart_rate: {
        Row: {
          created_at: string | null
          date: string
          heart_rate_average: number | null
          hrv_ms: number | null
          id: string
          resting_heart_rate: number | null
          source: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          heart_rate_average?: number | null
          hrv_ms?: number | null
          id?: string
          resting_heart_rate?: number | null
          source?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          heart_rate_average?: number | null
          hrv_ms?: number | null
          id?: string
          resting_heart_rate?: number | null
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      leaderboard_flags: {
        Row: {
          auto_flagged: boolean
          created_at: string
          flagged_by: string | null
          id: string
          reason: string | null
          resolved: boolean
          score_id: string
        }
        Insert: {
          auto_flagged?: boolean
          created_at?: string
          flagged_by?: string | null
          id?: string
          reason?: string | null
          resolved?: boolean
          score_id: string
        }
        Update: {
          auto_flagged?: boolean
          created_at?: string
          flagged_by?: string | null
          id?: string
          reason?: string | null
          resolved?: boolean
          score_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_flags_flagged_by_fkey"
            columns: ["flagged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_flags_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "erg_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_shares: {
        Row: {
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          team_id: string | null
          token: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          team_id?: string | null
          token?: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          team_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_shares_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_shares_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      lineup_templates: {
        Row: {
          boat_class: string
          boat_id: string | null
          coach_id: string | null
          created_at: string | null
          id: string
          name: string
          seats: Json
          team_id: string
          updated_at: string | null
        }
        Insert: {
          boat_class?: string
          boat_id?: string | null
          coach_id?: string | null
          created_at?: string | null
          id?: string
          name: string
          seats?: Json
          team_id: string
          updated_at?: string | null
        }
        Update: {
          boat_class?: string
          boat_id?: string | null
          coach_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
          seats?: Json
          team_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lineup_templates_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "team_boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_templates_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_templates_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempted_at: string | null
          email: string
          id: string
          ip_address: string | null
          success: boolean | null
        }
        Insert: {
          attempted_at?: string | null
          email: string
          id?: string
          ip_address?: string | null
          success?: boolean | null
        }
        Update: {
          attempted_at?: string | null
          email?: string
          id?: string
          ip_address?: string | null
          success?: boolean | null
        }
        Relationships: []
      }
      meal_plans: {
        Row: {
          calories: number | null
          carbs: number | null
          created_at: string | null
          description: string
          fats: number | null
          id: string
          is_favorite: boolean | null
          meal_date: string
          meal_type: string
          protein: number | null
          user_id: string
        }
        Insert: {
          calories?: number | null
          carbs?: number | null
          created_at?: string | null
          description: string
          fats?: number | null
          id?: string
          is_favorite?: boolean | null
          meal_date?: string
          meal_type: string
          protein?: number | null
          user_id: string
        }
        Update: {
          calories?: number | null
          carbs?: number | null
          created_at?: string | null
          description?: string
          fats?: number | null
          id?: string
          is_favorite?: boolean | null
          meal_date?: string
          meal_type?: string
          protein?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_payments: {
        Row: {
          amount: number
          created_at: string
          due_date: string | null
          id: string
          org_id: string
          paid_at: string | null
          status: string
          tier_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date?: string | null
          id?: string
          org_id: string
          paid_at?: string | null
          status?: string
          tier_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string | null
          id?: string
          org_id?: string
          paid_at?: string | null
          status?: string
          tier_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_payments_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_tiers: {
        Row: {
          billing_period: string
          created_at: string
          id: string
          name: string
          org_id: string
          price: number
        }
        Insert: {
          billing_period?: string
          created_at?: string
          id?: string
          name: string
          org_id: string
          price: number
        }
        Update: {
          billing_period?: string
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "membership_tiers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          coach_viewed_profile: boolean | null
          created_at: string | null
          direct_message: boolean | null
          friend_accepted: boolean | null
          friend_request: boolean | null
          id: string
          lineup_published: boolean | null
          new_pr: boolean | null
          personal_best: boolean | null
          practice_reminder: boolean | null
          team_board_post: boolean | null
          training_plan_updated: boolean | null
          training_reminders: boolean | null
          unsubscribe_token: string
          updated_at: string | null
          user_id: string
          weekly_challenge: boolean | null
          whoop_low_recovery: boolean | null
          workout_published: boolean
        }
        Insert: {
          coach_viewed_profile?: boolean | null
          created_at?: string | null
          direct_message?: boolean | null
          friend_accepted?: boolean | null
          friend_request?: boolean | null
          id?: string
          lineup_published?: boolean | null
          new_pr?: boolean | null
          personal_best?: boolean | null
          practice_reminder?: boolean | null
          team_board_post?: boolean | null
          training_plan_updated?: boolean | null
          training_reminders?: boolean | null
          unsubscribe_token?: string
          updated_at?: string | null
          user_id: string
          weekly_challenge?: boolean | null
          whoop_low_recovery?: boolean | null
          workout_published?: boolean
        }
        Update: {
          coach_viewed_profile?: boolean | null
          created_at?: string | null
          direct_message?: boolean | null
          friend_accepted?: boolean | null
          friend_request?: boolean | null
          id?: string
          lineup_published?: boolean | null
          new_pr?: boolean | null
          personal_best?: boolean | null
          practice_reminder?: boolean | null
          team_board_post?: boolean | null
          training_plan_updated?: boolean | null
          training_reminders?: boolean | null
          unsubscribe_token?: string
          updated_at?: string | null
          user_id?: string
          weekly_challenge?: boolean | null
          whoop_low_recovery?: boolean | null
          workout_published?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json | null
          id?: string
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json | null
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      on_water_pieces: {
        Row: {
          average_split_seconds: number | null
          created_at: string | null
          created_by: string | null
          distance: number | null
          id: string
          notes: string | null
          piece_number: number
          piece_type: string
          session_id: string
          splits: Json | null
          stroke_rate: number | null
          target_split_seconds: number | null
          team_id: string
          time_seconds: number | null
        }
        Insert: {
          average_split_seconds?: number | null
          created_at?: string | null
          created_by?: string | null
          distance?: number | null
          id?: string
          notes?: string | null
          piece_number?: number
          piece_type?: string
          session_id: string
          splits?: Json | null
          stroke_rate?: number | null
          target_split_seconds?: number | null
          team_id: string
          time_seconds?: number | null
        }
        Update: {
          average_split_seconds?: number | null
          created_at?: string | null
          created_by?: string | null
          distance?: number | null
          id?: string
          notes?: string | null
          piece_number?: number
          piece_type?: string
          session_id?: string
          splits?: Json | null
          stroke_rate?: number | null
          target_split_seconds?: number | null
          team_id?: string
          time_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "on_water_pieces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "on_water_pieces_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "practice_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "on_water_pieces_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      onwater_results: {
        Row: {
          athlete_ids: string[] | null
          avg_split_seconds: number | null
          boat_class: string | null
          boat_id: string | null
          conditions: string | null
          created_at: string | null
          created_by: string | null
          distance_meters: number | null
          id: string
          lineup_id: string | null
          logged_by: string | null
          notes: string | null
          piece_type: string
          result_date: string
          season_id: string | null
          splits: Json | null
          stroke_rate: number | null
          team_id: string | null
          time_seconds: number | null
          water_conditions: string | null
          wind_conditions: string | null
        }
        Insert: {
          athlete_ids?: string[] | null
          avg_split_seconds?: number | null
          boat_class?: string | null
          boat_id?: string | null
          conditions?: string | null
          created_at?: string | null
          created_by?: string | null
          distance_meters?: number | null
          id?: string
          lineup_id?: string | null
          logged_by?: string | null
          notes?: string | null
          piece_type: string
          result_date: string
          season_id?: string | null
          splits?: Json | null
          stroke_rate?: number | null
          team_id?: string | null
          time_seconds?: number | null
          water_conditions?: string | null
          wind_conditions?: string | null
        }
        Update: {
          athlete_ids?: string[] | null
          avg_split_seconds?: number | null
          boat_class?: string | null
          boat_id?: string | null
          conditions?: string | null
          created_at?: string | null
          created_by?: string | null
          distance_meters?: number | null
          id?: string
          lineup_id?: string | null
          logged_by?: string | null
          notes?: string | null
          piece_type?: string
          result_date?: string
          season_id?: string | null
          splits?: Json | null
          stroke_rate?: number | null
          team_id?: string | null
          time_seconds?: number | null
          water_conditions?: string | null
          wind_conditions?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onwater_results_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "team_boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onwater_results_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onwater_results_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "boat_lineups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onwater_results_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onwater_results_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "team_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onwater_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      org_alerts: {
        Row: {
          alert_type: string
          athlete_id: string | null
          created_at: string | null
          id: string
          message: string
          org_id: string | null
          resolved: boolean | null
          team_id: string
        }
        Insert: {
          alert_type: string
          athlete_id?: string | null
          created_at?: string | null
          id?: string
          message: string
          org_id?: string | null
          resolved?: boolean | null
          team_id: string
        }
        Update: {
          alert_type?: string
          athlete_id?: string | null
          created_at?: string | null
          id?: string
          message?: string
          org_id?: string | null
          resolved?: boolean | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_alerts_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_alerts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      org_announcements: {
        Row: {
          body: string
          created_at: string | null
          id: string
          is_urgent: boolean | null
          org_id: string | null
          posted_by: string
          team_id: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          is_urgent?: boolean | null
          org_id?: string | null
          posted_by: string
          team_id?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          is_urgent?: boolean | null
          org_id?: string | null
          posted_by?: string
          team_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_announcements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_announcements_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      org_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          organization_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_admins: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_admins_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_teams: {
        Row: {
          id: string
          joined_at: string
          organization_id: string
          team_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          organization_id: string
          team_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          organization_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          contact_email: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          plan_tier: string
          website: string | null
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          plan_tier?: string
          website?: string | null
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          plan_tier?: string
          website?: string | null
        }
        Relationships: []
      }
      parent_contacts: {
        Row: {
          athlete_id: string
          created_at: string | null
          id: string
          opted_in: boolean | null
          parent_email: string
          parent_name: string
          relationship: string | null
          team_id: string
        }
        Insert: {
          athlete_id: string
          created_at?: string | null
          id?: string
          opted_in?: boolean | null
          parent_email: string
          parent_name: string
          relationship?: string | null
          team_id: string
        }
        Update: {
          athlete_id?: string
          created_at?: string | null
          id?: string
          opted_in?: boolean | null
          parent_email?: string
          parent_name?: string
          relationship?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_contacts_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_contacts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_email_notes: {
        Row: {
          athlete_id: string
          coach_id: string
          created_at: string | null
          id: string
          individual_note: string | null
          team_id: string
          week_of: string
        }
        Insert: {
          athlete_id: string
          coach_id: string
          created_at?: string | null
          id?: string
          individual_note?: string | null
          team_id: string
          week_of: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          created_at?: string | null
          id?: string
          individual_note?: string | null
          team_id?: string
          week_of?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_email_notes_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_email_notes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_email_notes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_email_settings: {
        Row: {
          enabled: boolean | null
          id: string
          send_day: string | null
          send_hour: number | null
          team_id: string
          team_note: string | null
          updated_at: string | null
        }
        Insert: {
          enabled?: boolean | null
          id?: string
          send_day?: string | null
          send_hour?: number | null
          team_id: string
          team_note?: string | null
          updated_at?: string | null
        }
        Update: {
          enabled?: boolean | null
          id?: string
          send_day?: string | null
          send_hour?: number | null
          team_id?: string
          team_note?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_email_settings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_shares: {
        Row: {
          created_at: string | null
          id: string
          plan_id: string
          shared_by: string
          shared_with_team: string | null
          shared_with_user: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          plan_id: string
          shared_by: string
          shared_with_team?: string | null
          shared_with_user?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          plan_id?: string
          shared_by?: string
          shared_with_team?: string | null
          shared_with_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_shares_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_shares_shared_by_fkey"
            columns: ["shared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_shares_shared_with_team_fkey"
            columns: ["shared_with_team"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_shares_shared_with_user_fkey"
            columns: ["shared_with_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_attendance: {
        Row: {
          created_at: string | null
          id: string
          lineup_id: string
          overridden_by: string | null
          responded_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          lineup_id: string
          overridden_by?: string | null
          responded_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          lineup_id?: string
          overridden_by?: string | null
          responded_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_attendance_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "boat_lineups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_attendance_overridden_by_fkey"
            columns: ["overridden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_drills: {
        Row: {
          created_at: string | null
          drill_name: string
          duration_minutes: number | null
          id: string
          logged_by: string | null
          notes: string | null
          session_id: string
          team_id: string
        }
        Insert: {
          created_at?: string | null
          drill_name: string
          duration_minutes?: number | null
          id?: string
          logged_by?: string | null
          notes?: string | null
          session_id: string
          team_id: string
        }
        Update: {
          created_at?: string | null
          drill_name?: string
          duration_minutes?: number | null
          id?: string
          logged_by?: string | null
          notes?: string | null
          session_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_drills_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_drills_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "practice_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_drills_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_entries: {
        Row: {
          boat_id: string | null
          coach_notes: string | null
          created_at: string | null
          created_by: string | null
          id: string
          lineup_id: string | null
          practice_date: string
          status: string | null
          team_id: string
          updated_at: string | null
          workout_description: string | null
          workout_published_at: string | null
        }
        Insert: {
          boat_id?: string | null
          coach_notes?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          lineup_id?: string | null
          practice_date: string
          status?: string | null
          team_id: string
          updated_at?: string | null
          workout_description?: string | null
          workout_published_at?: string | null
        }
        Update: {
          boat_id?: string | null
          coach_notes?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          lineup_id?: string | null
          practice_date?: string
          status?: string | null
          team_id?: string
          updated_at?: string | null
          workout_description?: string | null
          workout_published_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practice_entries_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "team_boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_entries_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "boat_lineups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_entries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_entry_drafts: {
        Row: {
          draft_text: string | null
          practice_date: string
          team_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          draft_text?: string | null
          practice_date: string
          team_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          draft_text?: string | null
          practice_date?: string
          team_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practice_entry_drafts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_entry_drafts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_videos: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          session_id: string
          team_id: string
          uploaded_by: string | null
          video_path: string
          video_url: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          session_id: string
          team_id: string
          uploaded_by?: string | null
          video_path: string
          video_url?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          session_id?: string
          team_id?: string
          uploaded_by?: string | null
          video_path?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practice_videos_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "practice_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_videos_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_videos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_follows: {
        Row: {
          created_at: string | null
          follower_id: string | null
          following_id: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          follower_id?: string | null
          following_id?: string | null
          id?: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string | null
          following_id?: string | null
          id?: string
        }
        Relationships: []
      }
      profile_views: {
        Row: {
          created_at: string | null
          id: string
          profile_user_id: string | null
          viewer_id: string | null
          viewer_type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          profile_user_id?: string | null
          viewer_id?: string | null
          viewer_type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          profile_user_id?: string | null
          viewer_id?: string | null
          viewer_type?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          accepted_terms_at: string | null
          age: number | null
          allergies: string[] | null
          best_2k_date: string | null
          best_2k_seconds: number | null
          best_6k_date: string | null
          best_6k_seconds: number | null
          coach_city: string | null
          coach_state: string | null
          coaching_level: string | null
          contact_phone: string | null
          country: string | null
          cox_experience: string | null
          cox_notes: string | null
          cox_steering_pref: string | null
          cox_voice_level: number | null
          cox_weight_lbs: number | null
          cox_years_coxing: number | null
          created_at: string | null
          date_of_birth: string | null
          diet_goal: string | null
          disclaimer_acknowledged: boolean | null
          disclaimer_acknowledged_at: string | null
          email: string | null
          enable_meal_plans: boolean | null
          enable_strength_training: boolean | null
          experience_level: string | null
          food_preferences: string[] | null
          full_name: string | null
          gender: string | null
          goals: string | null
          graduation_year: number | null
          h2h_waiver_accepted: boolean | null
          h2h_waiver_accepted_at: string | null
          health_issues: string[] | null
          healthkit_connected: boolean | null
          healthkit_last_synced: string | null
          height: number | null
          hydration_goal_ml: number | null
          id: string
          is_coxswain: boolean | null
          last_active_at: string | null
          leaderboard_opt_in: boolean
          message_transparency_acknowledged: boolean | null
          org_name: string | null
          org_title: string | null
          parental_consent_given: boolean | null
          position_preference: string | null
          role: string | null
          side_preference: string | null
          stripe_customer_id: string | null
          subscription_status: string | null
          subscription_tier: string
          terms_version: string | null
          updated_at: string | null
          user_type: string | null
          username: string | null
          wants_launch_notification: boolean
          weight: number | null
          weight_kg: number | null
          weight_unit: string | null
          years_coaching: number | null
          years_rowing: number | null
        }
        Insert: {
          accepted_terms_at?: string | null
          age?: number | null
          allergies?: string[] | null
          best_2k_date?: string | null
          best_2k_seconds?: number | null
          best_6k_date?: string | null
          best_6k_seconds?: number | null
          coach_city?: string | null
          coach_state?: string | null
          coaching_level?: string | null
          contact_phone?: string | null
          country?: string | null
          cox_experience?: string | null
          cox_notes?: string | null
          cox_steering_pref?: string | null
          cox_voice_level?: number | null
          cox_weight_lbs?: number | null
          cox_years_coxing?: number | null
          created_at?: string | null
          date_of_birth?: string | null
          diet_goal?: string | null
          disclaimer_acknowledged?: boolean | null
          disclaimer_acknowledged_at?: string | null
          email?: string | null
          enable_meal_plans?: boolean | null
          enable_strength_training?: boolean | null
          experience_level?: string | null
          food_preferences?: string[] | null
          full_name?: string | null
          gender?: string | null
          goals?: string | null
          graduation_year?: number | null
          h2h_waiver_accepted?: boolean | null
          h2h_waiver_accepted_at?: string | null
          health_issues?: string[] | null
          healthkit_connected?: boolean | null
          healthkit_last_synced?: string | null
          height?: number | null
          hydration_goal_ml?: number | null
          id: string
          is_coxswain?: boolean | null
          last_active_at?: string | null
          leaderboard_opt_in?: boolean
          message_transparency_acknowledged?: boolean | null
          org_name?: string | null
          org_title?: string | null
          parental_consent_given?: boolean | null
          position_preference?: string | null
          role?: string | null
          side_preference?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          subscription_tier?: string
          terms_version?: string | null
          updated_at?: string | null
          user_type?: string | null
          username?: string | null
          wants_launch_notification?: boolean
          weight?: number | null
          weight_kg?: number | null
          weight_unit?: string | null
          years_coaching?: number | null
          years_rowing?: number | null
        }
        Update: {
          accepted_terms_at?: string | null
          age?: number | null
          allergies?: string[] | null
          best_2k_date?: string | null
          best_2k_seconds?: number | null
          best_6k_date?: string | null
          best_6k_seconds?: number | null
          coach_city?: string | null
          coach_state?: string | null
          coaching_level?: string | null
          contact_phone?: string | null
          country?: string | null
          cox_experience?: string | null
          cox_notes?: string | null
          cox_steering_pref?: string | null
          cox_voice_level?: number | null
          cox_weight_lbs?: number | null
          cox_years_coxing?: number | null
          created_at?: string | null
          date_of_birth?: string | null
          diet_goal?: string | null
          disclaimer_acknowledged?: boolean | null
          disclaimer_acknowledged_at?: string | null
          email?: string | null
          enable_meal_plans?: boolean | null
          enable_strength_training?: boolean | null
          experience_level?: string | null
          food_preferences?: string[] | null
          full_name?: string | null
          gender?: string | null
          goals?: string | null
          graduation_year?: number | null
          h2h_waiver_accepted?: boolean | null
          h2h_waiver_accepted_at?: string | null
          health_issues?: string[] | null
          healthkit_connected?: boolean | null
          healthkit_last_synced?: string | null
          height?: number | null
          hydration_goal_ml?: number | null
          id?: string
          is_coxswain?: boolean | null
          last_active_at?: string | null
          leaderboard_opt_in?: boolean
          message_transparency_acknowledged?: boolean | null
          org_name?: string | null
          org_title?: string | null
          parental_consent_given?: boolean | null
          position_preference?: string | null
          role?: string | null
          side_preference?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          subscription_tier?: string
          terms_version?: string | null
          updated_at?: string | null
          user_type?: string | null
          username?: string | null
          wants_launch_notification?: boolean
          weight?: number | null
          weight_kg?: number | null
          weight_unit?: string | null
          years_coaching?: number | null
          years_rowing?: number | null
        }
        Relationships: []
      }
      program_alumni: {
        Row: {
          athlete_name: string
          coach_id: string
          college_name: string | null
          created_at: string
          division: string | null
          grad_year: number | null
          high_school: string | null
          id: string
          notes: string | null
          sport: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          athlete_name: string
          coach_id: string
          college_name?: string | null
          created_at?: string
          division?: string | null
          grad_year?: number | null
          high_school?: string | null
          id?: string
          notes?: string | null
          sport?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          athlete_name?: string
          coach_id?: string
          college_name?: string | null
          created_at?: string
          division?: string | null
          grad_year?: number | null
          high_school?: string | null
          id?: string
          notes?: string | null
          sport?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_alumni_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string | null
          id: string
          platform: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      race_lineups: {
        Row: {
          ai_factors: Json | null
          ai_rationale: string | null
          boat_class: string
          created_at: string | null
          created_by: string | null
          id: string
          race_date: string | null
          race_name: string | null
          seats: Json
          team_id: string | null
        }
        Insert: {
          ai_factors?: Json | null
          ai_rationale?: string | null
          boat_class: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          race_date?: string | null
          race_name?: string | null
          seats?: Json
          team_id?: string | null
        }
        Update: {
          ai_factors?: Json | null
          ai_rationale?: string | null
          boat_class?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          race_date?: string | null
          race_name?: string | null
          seats?: Json
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "race_lineups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      race_participants: {
        Row: {
          avg_split: number | null
          avg_spm: number | null
          created_at: string
          current_distance: number | null
          current_split: number | null
          current_spm: number | null
          current_watts: number | null
          display_name: string
          elapsed_time: number | null
          erg_score_2k: number | null
          finish_time: number | null
          finished_at: string | null
          id: string
          room_id: string
          stroke_data: Json | null
          user_id: string
        }
        Insert: {
          avg_split?: number | null
          avg_spm?: number | null
          created_at?: string
          current_distance?: number | null
          current_split?: number | null
          current_spm?: number | null
          current_watts?: number | null
          display_name?: string
          elapsed_time?: number | null
          erg_score_2k?: number | null
          finish_time?: number | null
          finished_at?: string | null
          id?: string
          room_id: string
          stroke_data?: Json | null
          user_id: string
        }
        Update: {
          avg_split?: number | null
          avg_spm?: number | null
          created_at?: string
          current_distance?: number | null
          current_split?: number | null
          current_spm?: number | null
          current_watts?: number | null
          display_name?: string
          elapsed_time?: number | null
          erg_score_2k?: number | null
          finish_time?: number | null
          finished_at?: string | null
          id?: string
          room_id?: string
          stroke_data?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "race_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "race_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      race_queue: {
        Row: {
          display_name: string
          erg_score_2k: number | null
          id: string
          queued_at: string
          user_id: string
        }
        Insert: {
          display_name?: string
          erg_score_2k?: number | null
          id?: string
          queued_at?: string
          user_id: string
        }
        Update: {
          display_name?: string
          erg_score_2k?: number | null
          id?: string
          queued_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "race_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      race_rooms: {
        Row: {
          created_at: string
          creator_id: string
          distance: number
          id: string
          room_code: string
          status: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          distance?: number
          id?: string
          room_code: string
          status?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          distance?: number
          id?: string
          room_code?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "race_rooms_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          circuit_open: boolean | null
          count: number | null
          created_at: string | null
          id: string
          key: string
          opened_at: string | null
          window_start: string | null
        }
        Insert: {
          circuit_open?: boolean | null
          count?: number | null
          created_at?: string | null
          id?: string
          key: string
          opened_at?: string | null
          window_start?: string | null
        }
        Update: {
          circuit_open?: boolean | null
          count?: number | null
          created_at?: string | null
          id?: string
          key?: string
          opened_at?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      recovery_logs: {
        Row: {
          body_region: string
          created_at: string
          id: string
          log_date: string
          notes: string | null
          severity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          body_region: string
          created_at?: string
          id?: string
          log_date?: string
          notes?: string | null
          severity: number
          updated_at?: string
          user_id: string
        }
        Update: {
          body_region?: string
          created_at?: string
          id?: string
          log_date?: string
          notes?: string | null
          severity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recovery_metrics: {
        Row: {
          active_calories: number | null
          created_at: string | null
          date: string
          hrv: number | null
          id: string
          recovery_score_input: number | null
          resting_hr: number | null
          steps: number | null
          strain: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active_calories?: number | null
          created_at?: string | null
          date: string
          hrv?: number | null
          id?: string
          recovery_score_input?: number | null
          resting_hr?: number | null
          steps?: number | null
          strain?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active_calories?: number | null
          created_at?: string | null
          date?: string
          hrv?: number | null
          id?: string
          recovery_score_input?: number | null
          resting_hr?: number | null
          steps?: number | null
          strain?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_preferences: {
        Row: {
          created_at: string
          id: string
          track_calories: boolean
          track_sleep: boolean
          track_water: boolean
          track_weight: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          track_calories?: boolean
          track_sleep?: boolean
          track_water?: boolean
          track_weight?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          track_calories?: boolean
          track_sleep?: boolean
          track_water?: boolean
          track_weight?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_scores: {
        Row: {
          calorie_component: number | null
          created_at: string | null
          date: string
          hydration_component: number | null
          id: string
          score: number | null
          sleep_component: number | null
          user_id: string
          weight_component: number | null
        }
        Insert: {
          calorie_component?: number | null
          created_at?: string | null
          date?: string
          hydration_component?: number | null
          id?: string
          score?: number | null
          sleep_component?: number | null
          user_id: string
          weight_component?: number | null
        }
        Update: {
          calorie_component?: number | null
          created_at?: string | null
          date?: string
          hydration_component?: number | null
          id?: string
          score?: number | null
          sleep_component?: number | null
          user_id?: string
          weight_component?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recovery_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recruit_portal_views: {
        Row: {
          id: string
          team_id: string
          viewed_at: string | null
          viewer_ip: string | null
        }
        Insert: {
          id?: string
          team_id: string
          viewed_at?: string | null
          viewer_ip?: string | null
        }
        Update: {
          id?: string
          team_id?: string
          viewed_at?: string | null
          viewer_ip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recruit_portal_views_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_predictions: {
        Row: {
          created_at: string
          goals_snapshot: Json | null
          id: string
          prediction_data: Json
          profile_snapshot: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          goals_snapshot?: Json | null
          id?: string
          prediction_data: Json
          profile_snapshot: Json
          user_id: string
        }
        Update: {
          created_at?: string
          goals_snapshot?: Json | null
          id?: string
          prediction_data?: Json
          profile_snapshot?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reengagement_notifications: {
        Row: {
          days_inactive: number
          id: string
          message_variant: number
          sent_at: string | null
          user_id: string | null
        }
        Insert: {
          days_inactive: number
          id?: string
          message_variant?: number
          sent_at?: string | null
          user_id?: string | null
        }
        Update: {
          days_inactive?: number
          id?: string
          message_variant?: number
          sent_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reengagement_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      regatta_attendees: {
        Row: {
          created_at: string | null
          id: string
          regatta_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          regatta_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          regatta_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regatta_attendees_regatta_id_fkey"
            columns: ["regatta_id"]
            isOneToOne: false
            referencedRelation: "regattas"
            referencedColumns: ["id"]
          },
        ]
      }
      regatta_entries: {
        Row: {
          athletes: Json | null
          club: string | null
          created_at: string | null
          crew_name: string | null
          delta: string | null
          finish_time: string | null
          finish_time_seconds: number | null
          id: string
          lane: string | null
          placement: number | null
          race_id: string
          raw_data: Json | null
          regatta_id: string
          split: string | null
        }
        Insert: {
          athletes?: Json | null
          club?: string | null
          created_at?: string | null
          crew_name?: string | null
          delta?: string | null
          finish_time?: string | null
          finish_time_seconds?: number | null
          id?: string
          lane?: string | null
          placement?: number | null
          race_id: string
          raw_data?: Json | null
          regatta_id: string
          split?: string | null
        }
        Update: {
          athletes?: Json | null
          club?: string | null
          created_at?: string | null
          crew_name?: string | null
          delta?: string | null
          finish_time?: string | null
          finish_time_seconds?: number | null
          id?: string
          lane?: string | null
          placement?: number | null
          race_id?: string
          raw_data?: Json | null
          regatta_id?: string
          split?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regatta_entries_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "regatta_races"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regatta_entries_regatta_id_fkey"
            columns: ["regatta_id"]
            isOneToOne: false
            referencedRelation: "regattas"
            referencedColumns: ["id"]
          },
        ]
      }
      regatta_races: {
        Row: {
          boat_class: string | null
          created_at: string | null
          event_name: string | null
          gender: string | null
          id: string
          level: string | null
          race_name: string | null
          raw_data: Json | null
          regatta_id: string
          round: string | null
          scheduled_time: string | null
        }
        Insert: {
          boat_class?: string | null
          created_at?: string | null
          event_name?: string | null
          gender?: string | null
          id?: string
          level?: string | null
          race_name?: string | null
          raw_data?: Json | null
          regatta_id: string
          round?: string | null
          scheduled_time?: string | null
        }
        Update: {
          boat_class?: string | null
          created_at?: string | null
          event_name?: string | null
          gender?: string | null
          id?: string
          level?: string | null
          race_name?: string | null
          raw_data?: Json | null
          regatta_id?: string
          round?: string | null
          scheduled_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regatta_races_regatta_id_fkey"
            columns: ["regatta_id"]
            isOneToOne: false
            referencedRelation: "regattas"
            referencedColumns: ["id"]
          },
        ]
      }
      regatta_results: {
        Row: {
          boat_class: string | null
          cached_at: string | null
          club: string | null
          created_at: string | null
          crew: Json | null
          event_name: string | null
          finish_time: string | null
          id: string
          placement: number | null
          raw_data: Json | null
          regatta_id: string
        }
        Insert: {
          boat_class?: string | null
          cached_at?: string | null
          club?: string | null
          created_at?: string | null
          crew?: Json | null
          event_name?: string | null
          finish_time?: string | null
          id?: string
          placement?: number | null
          raw_data?: Json | null
          regatta_id: string
        }
        Update: {
          boat_class?: string | null
          cached_at?: string | null
          club?: string | null
          created_at?: string | null
          crew?: Json | null
          event_name?: string | null
          finish_time?: string | null
          id?: string
          placement?: number | null
          raw_data?: Json | null
          regatta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regatta_results_regatta_id_fkey"
            columns: ["regatta_id"]
            isOneToOne: false
            referencedRelation: "regattas"
            referencedColumns: ["id"]
          },
        ]
      }
      regattas: {
        Row: {
          cached_at: string | null
          created_at: string | null
          crewtimer_id: string | null
          end_date: string | null
          event_date: string | null
          event_type: string | null
          events: Json | null
          external_id: string | null
          fetched_at: string | null
          host_club: string | null
          id: string
          level: string | null
          location: string | null
          name: string
          raw_data: Json | null
          rc_url: string | null
          state: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          cached_at?: string | null
          created_at?: string | null
          crewtimer_id?: string | null
          end_date?: string | null
          event_date?: string | null
          event_type?: string | null
          events?: Json | null
          external_id?: string | null
          fetched_at?: string | null
          host_club?: string | null
          id?: string
          level?: string | null
          location?: string | null
          name: string
          raw_data?: Json | null
          rc_url?: string | null
          state?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          cached_at?: string | null
          created_at?: string | null
          crewtimer_id?: string | null
          end_date?: string | null
          event_date?: string | null
          event_type?: string | null
          events?: Json | null
          external_id?: string | null
          fetched_at?: string | null
          host_club?: string | null
          id?: string
          level?: string | null
          location?: string | null
          name?: string
          raw_data?: Json | null
          rc_url?: string | null
          state?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rowing_coaches: {
        Row: {
          coach_name: string | null
          conference: string | null
          created_at: string | null
          division: string
          email: string | null
          id: string
          phone: string | null
          school_name: string
          state: string | null
          title: string | null
          website: string | null
        }
        Insert: {
          coach_name?: string | null
          conference?: string | null
          created_at?: string | null
          division: string
          email?: string | null
          id?: string
          phone?: string | null
          school_name: string
          state?: string | null
          title?: string | null
          website?: string | null
        }
        Update: {
          coach_name?: string | null
          conference?: string | null
          created_at?: string | null
          division?: string
          email?: string | null
          id?: string
          phone?: string | null
          school_name?: string
          state?: string | null
          title?: string | null
          website?: string | null
        }
        Relationships: []
      }
      seat_races: {
        Row: {
          ai_confidence: number | null
          ai_ranking: Json | null
          athlete1_id: string | null
          athlete2_id: string | null
          boat_class: string
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          pieces: Json
          race_date: string
          team_id: string | null
          winner_id: string | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_ranking?: Json | null
          athlete1_id?: string | null
          athlete2_id?: string | null
          boat_class: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          pieces?: Json
          race_date: string
          team_id?: string | null
          winner_id?: string | null
        }
        Update: {
          ai_confidence?: number | null
          ai_ranking?: Json | null
          athlete1_id?: string | null
          athlete2_id?: string | null
          boat_class?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          pieces?: Json
          race_date?: string
          team_id?: string | null
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seat_races_athlete1_id_fkey"
            columns: ["athlete1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_races_athlete2_id_fkey"
            columns: ["athlete2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_races_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_races_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_races_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sleep_entries: {
        Row: {
          bedtime: string | null
          created_at: string | null
          date: string
          duration_hours: number
          id: string
          quality_score: number | null
          user_id: string
          wake_time: string | null
        }
        Insert: {
          bedtime?: string | null
          created_at?: string | null
          date?: string
          duration_hours: number
          id?: string
          quality_score?: number | null
          user_id: string
          wake_time?: string | null
        }
        Update: {
          bedtime?: string | null
          created_at?: string | null
          date?: string
          duration_hours?: number
          id?: string
          quality_score?: number | null
          user_id?: string
          wake_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sleep_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      streak_freezes: {
        Row: {
          created_at: string
          freeze_date: string
          id: string
          used: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          freeze_date: string
          id?: string
          used?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          freeze_date?: string
          id?: string
          used?: boolean
          user_id?: string
        }
        Relationships: []
      }
      strength_program_logs: {
        Row: {
          created_at: string | null
          day_key: string
          exercises: Json
          id: string
          notes: string | null
          program_id: string
          session_date: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          day_key: string
          exercises?: Json
          id?: string
          notes?: string | null
          program_id: string
          session_date?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          day_key?: string
          exercises?: Json
          id?: string
          notes?: string | null
          program_id?: string
          session_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strength_program_logs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "default_strength_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strength_program_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      strength_workouts: {
        Row: {
          cooldown_notes: string | null
          created_at: string | null
          exercise: string
          id: string
          notes: string | null
          reps: number
          rest_between_sets: string | null
          sets: number
          user_id: string
          warmup_notes: string | null
          weight: number
          workout_date: string
        }
        Insert: {
          cooldown_notes?: string | null
          created_at?: string | null
          exercise: string
          id?: string
          notes?: string | null
          reps: number
          rest_between_sets?: string | null
          sets: number
          user_id: string
          warmup_notes?: string | null
          weight: number
          workout_date?: string
        }
        Update: {
          cooldown_notes?: string | null
          created_at?: string | null
          exercise?: string
          id?: string
          notes?: string | null
          reps?: number
          rest_between_sets?: string | null
          sets?: number
          user_id?: string
          warmup_notes?: string | null
          weight?: number
          workout_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "strength_workouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          id: string
          plan_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          team_id: string | null
          team_size: string | null
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          team_id?: string | null
          team_size?: string | null
          tier: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          team_id?: string | null
          team_size?: string | null
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_athletic_directors: {
        Row: {
          created_at: string | null
          id: string
          invited_by: string
          invited_email: string
          joined_at: string | null
          status: string
          team_id: string
          token: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          invited_by: string
          invited_email: string
          joined_at?: string | null
          status?: string
          team_id: string
          token?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          invited_by?: string
          invited_email?: string
          joined_at?: string | null
          status?: string
          team_id?: string
          token?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_athletic_directors_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_board_posts: {
        Row: {
          author_id: string | null
          category: string | null
          content: string
          created_at: string | null
          id: string
          is_edited: boolean | null
          is_pinned: boolean | null
          parent_id: string | null
          team_id: string | null
          updated_at: string | null
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          content: string
          created_at?: string | null
          id?: string
          is_edited?: boolean | null
          is_pinned?: boolean | null
          parent_id?: string | null
          team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          author_id?: string | null
          category?: string | null
          content?: string
          created_at?: string | null
          id?: string
          is_edited?: boolean | null
          is_pinned?: boolean | null
          parent_id?: string | null
          team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_board_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_board_posts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "team_board_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_board_posts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_boats: {
        Row: {
          boat_class: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          team_id: string
        }
        Insert: {
          boat_class: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          team_id: string
        }
        Update: {
          boat_class?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_boats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_coaches: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string | null
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_coaches_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_daily_workouts: {
        Row: {
          created_at: string | null
          date: string
          id: string
          pushed_by: string | null
          team_id: string
          updated_at: string | null
          workout_data: Json
        }
        Insert: {
          created_at?: string | null
          date?: string
          id?: string
          pushed_by?: string | null
          team_id: string
          updated_at?: string | null
          workout_data: Json
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          pushed_by?: string | null
          team_id?: string
          updated_at?: string | null
          workout_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "team_daily_workouts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_events: {
        Row: {
          coach_id: string
          created_at: string
          date: string
          description: string | null
          end_time: string | null
          event_type: string
          id: string
          is_recurring: boolean
          location: string | null
          notify_team: boolean
          recurrence_rule: string | null
          start_time: string | null
          team_id: string
          title: string
          updated_at: string
          visible_to: Json
        }
        Insert: {
          coach_id: string
          created_at?: string
          date: string
          description?: string | null
          end_time?: string | null
          event_type?: string
          id?: string
          is_recurring?: boolean
          location?: string | null
          notify_team?: boolean
          recurrence_rule?: string | null
          start_time?: string | null
          team_id: string
          title: string
          updated_at?: string
          visible_to?: Json
        }
        Update: {
          coach_id?: string
          created_at?: string
          date?: string
          description?: string | null
          end_time?: string | null
          event_type?: string
          id?: string
          is_recurring?: boolean
          location?: string | null
          notify_team?: boolean
          recurrence_rule?: string | null
          start_time?: string | null
          team_id?: string
          title?: string
          updated_at?: string
          visible_to?: Json
        }
        Relationships: [
          {
            foreignKeyName: "team_events_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_goals: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          target_date: string | null
          team_id: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          target_date?: string | null
          team_id: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          target_date?: string | null
          team_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          joined_at: string | null
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          team_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          team_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_messages_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_plans: {
        Row: {
          coach_id: string
          created_at: string | null
          id: string
          is_active: boolean
          plan_data: Json
          source: string
          team_id: string
          title: string
          total_weeks: number
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          plan_data: Json
          source: string
          team_id: string
          title: string
          total_weeks?: number
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          plan_data?: Json
          source?: string
          team_id?: string
          title?: string
          total_weeks?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_plans_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_plans_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_recruitment_targets: {
        Row: {
          created_at: string | null
          created_by: string | null
          graduation_years: number[] | null
          id: string
          notes: string | null
          position: string | null
          priority: string | null
          side_needed: string | null
          team_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          graduation_years?: number[] | null
          id?: string
          notes?: string | null
          position?: string | null
          priority?: string | null
          side_needed?: string | null
          team_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          graduation_years?: number[] | null
          id?: string
          notes?: string | null
          position?: string | null
          priority?: string | null
          side_needed?: string | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_recruitment_targets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_recruitment_targets_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_seasons: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          is_active: boolean | null
          name: string
          start_date: string
          team_id: string
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: string
          is_active?: boolean | null
          name: string
          start_date: string
          team_id: string
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          name?: string
          start_date?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_seasons_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_training_philosophy: {
        Row: {
          coach_id: string
          created_at: string | null
          id: string
          philosophy: Json | null
          raw_file_url: string | null
          summary: string | null
          team_id: string
          updated_at: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          id?: string
          philosophy?: Json | null
          raw_file_url?: string | null
          summary?: string | null
          team_id: string
          updated_at?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          id?: string
          philosophy?: Json | null
          raw_file_url?: string | null
          summary?: string | null
          team_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_training_philosophy_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_training_philosophy_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          coach_id: string
          created_at: string | null
          description: string | null
          id: string
          join_code: string | null
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          name: string
          portal_description: string | null
          portal_public: boolean | null
          primary_color: string | null
          safesport_mode: boolean
          slug: string | null
          training_philosophy_id: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          join_code?: string | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name: string
          portal_description?: string | null
          portal_public?: boolean | null
          primary_color?: string | null
          safesport_mode?: boolean
          slug?: string | null
          training_philosophy_id?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          join_code?: string | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name?: string
          portal_description?: string | null
          portal_public?: boolean | null
          primary_color?: string | null
          safesport_mode?: boolean
          slug?: string | null
          training_philosophy_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_training_philosophy_id_fkey"
            columns: ["training_philosophy_id"]
            isOneToOne: false
            referencedRelation: "default_training_philosophy"
            referencedColumns: ["id"]
          },
        ]
      }
      technique_analyses: {
        Row: {
          created_at: string | null
          critique: Json
          id: string
          notes: string | null
          user_id: string
          video_path: string | null
          video_url: string | null
        }
        Insert: {
          created_at?: string | null
          critique: Json
          id?: string
          notes?: string | null
          user_id: string
          video_path?: string | null
          video_url?: string | null
        }
        Update: {
          created_at?: string | null
          critique?: Json
          id?: string
          notes?: string | null
          user_id?: string
          video_path?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      training_plan_preferences: {
        Row: {
          created_at: string | null
          goal_date: string | null
          id: string
          include_lifting: boolean | null
          include_two_a_days: boolean | null
          intensity: string
          lifting_days_per_week: number | null
          training_goal: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          goal_date?: string | null
          id?: string
          include_lifting?: boolean | null
          include_two_a_days?: boolean | null
          intensity?: string
          lifting_days_per_week?: number | null
          training_goal?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          goal_date?: string | null
          id?: string
          include_lifting?: boolean | null
          include_two_a_days?: boolean | null
          intensity?: string
          lifting_days_per_week?: number | null
          training_goal?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_plan_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_goals: {
        Row: {
          created_at: string | null
          current_2k_time: string | null
          current_5k_time: string | null
          current_6k_time: string | null
          goal_2k_time: string | null
          goal_5k_time: string | null
          goal_6k_time: string | null
          id: string
          notes: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_2k_time?: string | null
          current_5k_time?: string | null
          current_6k_time?: string | null
          goal_2k_time?: string | null
          goal_5k_time?: string | null
          goal_6k_time?: string | null
          id?: string
          notes?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_2k_time?: string | null
          current_5k_time?: string | null
          current_6k_time?: string | null
          goal_2k_time?: string | null
          goal_5k_time?: string | null
          goal_6k_time?: string | null
          id?: string
          notes?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_tour_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          completed_steps: Json
          created_at: string
          id: string
          skipped: boolean
          started_at: string | null
          tour_id: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          completed_steps?: Json
          created_at?: string
          id?: string
          skipped?: boolean
          started_at?: string | null
          tour_id: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          completed_steps?: Json
          created_at?: string
          id?: string
          skipped?: boolean
          started_at?: string | null
          tour_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tour_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verified_times: {
        Row: {
          category: string
          created_at: string
          distance: number
          gender: string
          id: string
          rejection_reason: string | null
          screenshot_url: string
          submitted_at: string
          time_achieved: string
          updated_at: string
          user_id: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
          weight_class: string | null
        }
        Insert: {
          category: string
          created_at?: string
          distance: number
          gender: string
          id?: string
          rejection_reason?: string | null
          screenshot_url: string
          submitted_at?: string
          time_achieved: string
          updated_at?: string
          user_id: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          weight_class?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          distance?: number
          gender?: string
          id?: string
          rejection_reason?: string | null
          screenshot_url?: string
          submitted_at?: string
          time_achieved?: string
          updated_at?: string
          user_id?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          weight_class?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verified_times_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_times_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteer_hours: {
        Row: {
          created_at: string
          date: string
          hours: number
          id: string
          notes: string | null
          org_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          hours: number
          id?: string
          notes?: string | null
          org_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          hours?: number
          id?: string
          notes?: string | null
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "volunteer_hours_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_hours_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      water_entries: {
        Row: {
          amount_ml: number
          created_at: string | null
          date: string
          id: string
          user_id: string
        }
        Insert: {
          amount_ml: number
          created_at?: string | null
          date?: string
          id?: string
          user_id: string
        }
        Update: {
          amount_ml?: number
          created_at?: string | null
          date?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "water_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_challenge_completions: {
        Row: {
          challenge_id: string
          completed_at: string
          id: string
          user_id: string
          week_number: number
          year: number
        }
        Insert: {
          challenge_id: string
          completed_at?: string
          id?: string
          user_id: string
          week_number: number
          year: number
        }
        Update: {
          challenge_id?: string
          completed_at?: string
          id?: string
          user_id?: string
          week_number?: number
          year?: number
        }
        Relationships: []
      }
      weekly_challenges: {
        Row: {
          ai_reasoning: string | null
          challenge_type: string
          created_at: string
          description: string
          id: string
          season_phase: string | null
          title: string
          week_start: string
        }
        Insert: {
          ai_reasoning?: string | null
          challenge_type: string
          created_at?: string
          description: string
          id?: string
          season_phase?: string | null
          title: string
          week_start: string
        }
        Update: {
          ai_reasoning?: string | null
          challenge_type?: string
          created_at?: string
          description?: string
          id?: string
          season_phase?: string | null
          title?: string
          week_start?: string
        }
        Relationships: []
      }
      weekly_load_logs: {
        Row: {
          created_at: string | null
          erg_meters: number | null
          fatigue_score: number | null
          id: string
          intensity_distribution: Json | null
          notes: string | null
          on_water_meters: number | null
          soreness_score: number | null
          team_id: string | null
          total_meters: number | null
          user_id: string | null
          week_start: string
        }
        Insert: {
          created_at?: string | null
          erg_meters?: number | null
          fatigue_score?: number | null
          id?: string
          intensity_distribution?: Json | null
          notes?: string | null
          on_water_meters?: number | null
          soreness_score?: number | null
          team_id?: string | null
          total_meters?: number | null
          user_id?: string | null
          week_start: string
        }
        Update: {
          created_at?: string | null
          erg_meters?: number | null
          fatigue_score?: number | null
          id?: string
          intensity_distribution?: Json | null
          notes?: string | null
          on_water_meters?: number | null
          soreness_score?: number | null
          team_id?: string | null
          total_meters?: number | null
          user_id?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_load_logs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_load_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_entries: {
        Row: {
          created_at: string | null
          date: string
          id: string
          unit: string
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string | null
          date?: string
          id?: string
          unit?: string
          user_id: string
          weight: number
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          unit?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "weight_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wellness_checkins: {
        Row: {
          checkin_date: string
          created_at: string | null
          energy: number | null
          id: string
          notes: string | null
          sleep_hours: number | null
          soreness: number | null
          team_id: string
          user_id: string
        }
        Insert: {
          checkin_date?: string
          created_at?: string | null
          energy?: number | null
          id?: string
          notes?: string | null
          sleep_hours?: number | null
          soreness?: number | null
          team_id: string
          user_id: string
        }
        Update: {
          checkin_date?: string
          created_at?: string | null
          energy?: number | null
          id?: string
          notes?: string | null
          sleep_hours?: number | null
          soreness?: number | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wellness_checkins_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wellness_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whoop_connections: {
        Row: {
          access_token: string
          created_at: string | null
          expires_at: string | null
          id: string
          last_auto_sync_at: string | null
          last_sync_at: string | null
          refresh_token: string | null
          updated_at: string | null
          user_id: string
          whoop_user_id: string | null
        }
        Insert: {
          access_token: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_auto_sync_at?: string | null
          last_sync_at?: string | null
          refresh_token?: string | null
          updated_at?: string | null
          user_id: string
          whoop_user_id?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_auto_sync_at?: string | null
          last_sync_at?: string | null
          refresh_token?: string | null
          updated_at?: string | null
          user_id?: string
          whoop_user_id?: string | null
        }
        Relationships: []
      }
      whoop_recovery: {
        Row: {
          blood_oxygen_percentage: number | null
          created_at: string | null
          date: string
          hrv_rmssd: number | null
          id: string
          recovery_score: number | null
          resting_heart_rate: number | null
          skin_temp_celsius: number | null
          sleep_performance_percentage: number | null
          user_id: string
          whoop_cycle_id: number | null
        }
        Insert: {
          blood_oxygen_percentage?: number | null
          created_at?: string | null
          date: string
          hrv_rmssd?: number | null
          id?: string
          recovery_score?: number | null
          resting_heart_rate?: number | null
          skin_temp_celsius?: number | null
          sleep_performance_percentage?: number | null
          user_id: string
          whoop_cycle_id?: number | null
        }
        Update: {
          blood_oxygen_percentage?: number | null
          created_at?: string | null
          date?: string
          hrv_rmssd?: number | null
          id?: string
          recovery_score?: number | null
          resting_heart_rate?: number | null
          skin_temp_celsius?: number | null
          sleep_performance_percentage?: number | null
          user_id?: string
          whoop_cycle_id?: number | null
        }
        Relationships: []
      }
      whoop_sleep: {
        Row: {
          awake_ms: number | null
          created_at: string | null
          date: string
          disturbance_count: number | null
          duration_hours: number | null
          end_time: string | null
          id: string
          light_sleep_ms: number | null
          rem_sleep_ms: number | null
          respiratory_rate: number | null
          sleep_debt_ms: number | null
          sleep_efficiency_percentage: number | null
          sleep_need_ms: number | null
          sleep_performance_percentage: number | null
          slow_wave_sleep_ms: number | null
          start_time: string | null
          user_id: string
          whoop_sleep_id: number | null
        }
        Insert: {
          awake_ms?: number | null
          created_at?: string | null
          date: string
          disturbance_count?: number | null
          duration_hours?: number | null
          end_time?: string | null
          id?: string
          light_sleep_ms?: number | null
          rem_sleep_ms?: number | null
          respiratory_rate?: number | null
          sleep_debt_ms?: number | null
          sleep_efficiency_percentage?: number | null
          sleep_need_ms?: number | null
          sleep_performance_percentage?: number | null
          slow_wave_sleep_ms?: number | null
          start_time?: string | null
          user_id: string
          whoop_sleep_id?: number | null
        }
        Update: {
          awake_ms?: number | null
          created_at?: string | null
          date?: string
          disturbance_count?: number | null
          duration_hours?: number | null
          end_time?: string | null
          id?: string
          light_sleep_ms?: number | null
          rem_sleep_ms?: number | null
          respiratory_rate?: number | null
          sleep_debt_ms?: number | null
          sleep_efficiency_percentage?: number | null
          sleep_need_ms?: number | null
          sleep_performance_percentage?: number | null
          slow_wave_sleep_ms?: number | null
          start_time?: string | null
          user_id?: string
          whoop_sleep_id?: number | null
        }
        Relationships: []
      }
      whoop_strain: {
        Row: {
          average_heart_rate: number | null
          created_at: string | null
          date: string
          id: string
          kilojoule: number | null
          max_heart_rate: number | null
          strain: number | null
          user_id: string
          whoop_cycle_id: number | null
        }
        Insert: {
          average_heart_rate?: number | null
          created_at?: string | null
          date: string
          id?: string
          kilojoule?: number | null
          max_heart_rate?: number | null
          strain?: number | null
          user_id: string
          whoop_cycle_id?: number | null
        }
        Update: {
          average_heart_rate?: number | null
          created_at?: string | null
          date?: string
          id?: string
          kilojoule?: number | null
          max_heart_rate?: number | null
          strain?: number | null
          user_id?: string
          whoop_cycle_id?: number | null
        }
        Relationships: []
      }
      whoop_workouts: {
        Row: {
          average_heart_rate: number | null
          created_at: string | null
          end_time: string | null
          id: string
          kilojoule: number | null
          max_heart_rate: number | null
          sport_id: number | null
          sport_name: string | null
          start_time: string
          strain: number | null
          user_id: string
          whoop_workout_id: number | null
          zone_1_ms: number | null
          zone_2_ms: number | null
          zone_3_ms: number | null
          zone_4_ms: number | null
          zone_5_ms: number | null
        }
        Insert: {
          average_heart_rate?: number | null
          created_at?: string | null
          end_time?: string | null
          id?: string
          kilojoule?: number | null
          max_heart_rate?: number | null
          sport_id?: number | null
          sport_name?: string | null
          start_time: string
          strain?: number | null
          user_id: string
          whoop_workout_id?: number | null
          zone_1_ms?: number | null
          zone_2_ms?: number | null
          zone_3_ms?: number | null
          zone_4_ms?: number | null
          zone_5_ms?: number | null
        }
        Update: {
          average_heart_rate?: number | null
          created_at?: string | null
          end_time?: string | null
          id?: string
          kilojoule?: number | null
          max_heart_rate?: number | null
          sport_id?: number | null
          sport_name?: string | null
          start_time?: string
          strain?: number | null
          user_id?: string
          whoop_workout_id?: number | null
          zone_1_ms?: number | null
          zone_2_ms?: number | null
          zone_3_ms?: number | null
          zone_4_ms?: number | null
          zone_5_ms?: number | null
        }
        Relationships: []
      }
      workout_annotations: {
        Row: {
          athlete_id: string
          coach_id: string
          created_at: string
          id: string
          note: string
          workout_id: string
          workout_type: string
        }
        Insert: {
          athlete_id: string
          coach_id: string
          created_at?: string
          id?: string
          note: string
          workout_id: string
          workout_type: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          note?: string
          workout_id?: string
          workout_type?: string
        }
        Relationships: []
      }
      workout_plans: {
        Row: {
          coach_plan_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_coach_assigned: boolean | null
          start_date: string | null
          title: string
          user_id: string
          workout_data: Json
        }
        Insert: {
          coach_plan_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_coach_assigned?: boolean | null
          start_date?: string | null
          title: string
          user_id: string
          workout_data: Json
        }
        Update: {
          coach_plan_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_coach_assigned?: boolean | null
          start_date?: string | null
          title?: string
          user_id?: string
          workout_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "workout_plans_coach_plan_id_fkey"
            columns: ["coach_plan_id"]
            isOneToOne: false
            referencedRelation: "team_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_shares: {
        Row: {
          created_at: string | null
          erg_workout_id: string | null
          id: string
          shared_by: string
          shared_with: string
          strength_workout_id: string | null
        }
        Insert: {
          created_at?: string | null
          erg_workout_id?: string | null
          id?: string
          shared_by: string
          shared_with: string
          strength_workout_id?: string | null
        }
        Update: {
          created_at?: string | null
          erg_workout_id?: string | null
          id?: string
          shared_by?: string
          shared_with?: string
          strength_workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_shares_erg_workout_id_fkey"
            columns: ["erg_workout_id"]
            isOneToOne: false
            referencedRelation: "erg_workouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_shares_shared_by_fkey"
            columns: ["shared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_shares_shared_with_fkey"
            columns: ["shared_with"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_shares_strength_workout_id_fkey"
            columns: ["strength_workout_id"]
            isOneToOne: false
            referencedRelation: "strength_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_coach_invite: {
        Args: { p_token: string }
        Returns: {
          team_id: string
          team_name: string
        }[]
      }
      check_ai_circuit: { Args: { p_function: string }; Returns: boolean }
      get_assignment_team_average: {
        Args: { p_assignment_id: string }
        Returns: {
          avg_split_seconds: number
          completed_count: number
          piece_number: number
        }[]
      }
      get_avg_best_2k: { Args: never; Returns: number }
      get_avg_verified_2k: { Args: never; Returns: number }
      get_cached_response: { Args: { p_cache_key: string }; Returns: string }
      get_daily_ai_usage: { Args: { p_user_id: string }; Returns: Json }
      get_total_meters: { Args: never; Returns: number }
      get_user_ad_teams: { Args: never; Returns: string[] }
      get_user_admin_org_ids: { Args: never; Returns: string[] }
      get_user_coached_team_ids: { Args: never; Returns: string[] }
      get_user_count: { Args: never; Returns: number }
      get_user_org_ids: { Args: never; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_coach_view: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      increment_daily_ai_usage: {
        Args: { p_tokens: number; p_user_id: string }
        Returns: Json
      }
      increment_profile_view: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      is_minor: { Args: { dob: string }; Returns: boolean }
      is_team_coach: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_head_coach: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      join_team_by_code: {
        Args: { p_code: string }
        Returns: {
          team_id: string
          team_name: string
        }[]
      }
      minor_can_appear_on_leaderboard: {
        Args: { user_id: string }
        Returns: boolean
      }
      publish_lineup: {
        Args: { p_lineup_id: string; p_seats: Json }
        Returns: {
          attendance_rows: number
          lineup_id: string
          published_at: string
        }[]
      }
      record_ai_error: { Args: { p_function: string }; Returns: undefined }
      record_ai_success: { Args: { p_function: string }; Returns: undefined }
      search_users_for_friend_request: {
        Args: { current_user_id: string; search_term: string }
        Returns: {
          email: string
          id: string
          username: string
        }[]
      }
      set_cached_response: {
        Args: {
          p_cache_key: string
          p_expires_at: string
          p_input_tokens: number
          p_model: string
          p_output_tokens: number
          p_response: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "user" | "coach" | "admin"
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
    Enums: {
      app_role: ["user", "coach", "admin"],
    },
  },
} as const
