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
      erg_workouts: {
        Row: {
          avg_heart_rate: number | null
          avg_split: unknown
          calories: number | null
          created_at: string | null
          distance: number | null
          duration: unknown
          id: string
          notes: string | null
          user_id: string
          workout_date: string
          workout_type: string
        }
        Insert: {
          avg_heart_rate?: number | null
          avg_split?: unknown
          calories?: number | null
          created_at?: string | null
          distance?: number | null
          duration?: unknown
          id?: string
          notes?: string | null
          user_id: string
          workout_date?: string
          workout_type: string
        }
        Update: {
          avg_heart_rate?: number | null
          avg_split?: unknown
          calories?: number | null
          created_at?: string | null
          distance?: number | null
          duration?: unknown
          id?: string
          notes?: string | null
          user_id?: string
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
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          experience_level: string | null
          full_name: string | null
          goals: string | null
          height: number | null
          id: string
          updated_at: string | null
          weight: number | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          experience_level?: string | null
          full_name?: string | null
          goals?: string | null
          height?: number | null
          id: string
          updated_at?: string | null
          weight?: number | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          experience_level?: string | null
          full_name?: string | null
          goals?: string | null
          height?: number | null
          id?: string
          updated_at?: string | null
          weight?: number | null
        }
        Relationships: []
      }
      strength_workouts: {
        Row: {
          created_at: string | null
          exercise: string
          id: string
          notes: string | null
          reps: number
          sets: number
          user_id: string
          weight: number
          workout_date: string
        }
        Insert: {
          created_at?: string | null
          exercise: string
          id?: string
          notes?: string | null
          reps: number
          sets: number
          user_id: string
          weight: number
          workout_date?: string
        }
        Update: {
          created_at?: string | null
          exercise?: string
          id?: string
          notes?: string | null
          reps?: number
          sets?: number
          user_id?: string
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
      user_goals: {
        Row: {
          created_at: string | null
          current_2k_time: unknown
          current_5k_time: unknown
          current_6k_time: unknown
          goal_2k_time: unknown
          goal_5k_time: unknown
          goal_6k_time: unknown
          id: string
          notes: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_2k_time?: unknown
          current_5k_time?: unknown
          current_6k_time?: unknown
          goal_2k_time?: unknown
          goal_5k_time?: unknown
          goal_6k_time?: unknown
          id?: string
          notes?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_2k_time?: unknown
          current_5k_time?: unknown
          current_6k_time?: unknown
          goal_2k_time?: unknown
          goal_5k_time?: unknown
          goal_6k_time?: unknown
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
