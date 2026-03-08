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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
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
      erg_workouts: {
        Row: {
          avg_heart_rate: number | null
          avg_split: string | null
          calories: number | null
          cooldown_duration: string | null
          created_at: string | null
          distance: number | null
          duration: string | null
          id: string
          notes: string | null
          rest_periods: string | null
          user_id: string
          warmup_duration: string | null
          workout_date: string
          workout_type: string
        }
        Insert: {
          avg_heart_rate?: number | null
          avg_split?: string | null
          calories?: number | null
          cooldown_duration?: string | null
          created_at?: string | null
          distance?: number | null
          duration?: string | null
          id?: string
          notes?: string | null
          rest_periods?: string | null
          user_id: string
          warmup_duration?: string | null
          workout_date?: string
          workout_type: string
        }
        Update: {
          avg_heart_rate?: number | null
          avg_split?: string | null
          calories?: number | null
          cooldown_duration?: string | null
          created_at?: string | null
          distance?: number | null
          duration?: string | null
          id?: string
          notes?: string | null
          rest_periods?: string | null
          user_id?: string
          warmup_duration?: string | null
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
          is_edited: boolean | null
          parent_post_id: string | null
          topic_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          is_edited?: boolean | null
          parent_post_id?: string | null
          topic_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          is_edited?: boolean | null
          parent_post_id?: string | null
          topic_id?: string
          updated_at?: string
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
      profiles: {
        Row: {
          age: number | null
          allergies: string[] | null
          created_at: string | null
          diet_goal: string | null
          email: string | null
          enable_meal_plans: boolean | null
          enable_strength_training: boolean | null
          experience_level: string | null
          food_preferences: string[] | null
          full_name: string | null
          goals: string | null
          health_issues: string[] | null
          height: number | null
          id: string
          updated_at: string | null
          user_type: string | null
          username: string | null
          weight: number | null
        }
        Insert: {
          age?: number | null
          allergies?: string[] | null
          created_at?: string | null
          diet_goal?: string | null
          email?: string | null
          enable_meal_plans?: boolean | null
          enable_strength_training?: boolean | null
          experience_level?: string | null
          food_preferences?: string[] | null
          full_name?: string | null
          goals?: string | null
          health_issues?: string[] | null
          height?: number | null
          id: string
          updated_at?: string | null
          user_type?: string | null
          username?: string | null
          weight?: number | null
        }
        Update: {
          age?: number | null
          allergies?: string[] | null
          created_at?: string | null
          diet_goal?: string | null
          email?: string | null
          enable_meal_plans?: boolean | null
          enable_strength_training?: boolean | null
          experience_level?: string | null
          food_preferences?: string[] | null
          full_name?: string | null
          goals?: string | null
          health_issues?: string[] | null
          height?: number | null
          id?: string
          updated_at?: string | null
          user_type?: string | null
          username?: string | null
          weight?: number | null
        }
        Relationships: []
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
      teams: {
        Row: {
          coach_id: string
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
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
      workout_plans: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          title: string
          user_id: string
          workout_data: Json
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          title: string
          user_id: string
          workout_data: Json
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          title?: string
          user_id?: string
          workout_data?: Json
        }
        Relationships: []
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_team_coach: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      search_users_for_friend_request: {
        Args: { current_user_id: string; search_term: string }
        Returns: {
          email: string
          id: string
          username: string
        }[]
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
  public: {
    Enums: {
      app_role: ["user", "coach", "admin"],
    },
  },
} as const
