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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_request_at: string | null
          last_reset_at: string | null
          name: string
          rate_limit_per_day: number | null
          requests_today: number | null
          revoked_at: string | null
          scopes: string[] | null
          status: Database["public"]["Enums"]["api_key_status"] | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_request_at?: string | null
          last_reset_at?: string | null
          name: string
          rate_limit_per_day?: number | null
          requests_today?: number | null
          revoked_at?: string | null
          scopes?: string[] | null
          status?: Database["public"]["Enums"]["api_key_status"] | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_request_at?: string | null
          last_reset_at?: string | null
          name?: string
          rate_limit_per_day?: number | null
          requests_today?: number | null
          revoked_at?: string | null
          scopes?: string[] | null
          status?: Database["public"]["Enums"]["api_key_status"] | null
          user_id?: string
        }
        Relationships: []
      }
      api_usage_logs: {
        Row: {
          api_key_id: string
          created_at: string | null
          endpoint: string
          id: string
          ip_address: string | null
          method: string
          response_time_ms: number | null
          status_code: number | null
        }
        Insert: {
          api_key_id: string
          created_at?: string | null
          endpoint: string
          id?: string
          ip_address?: string | null
          method: string
          response_time_ms?: number | null
          status_code?: number | null
        }
        Update: {
          api_key_id?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          ip_address?: string | null
          method?: string
          response_time_ms?: number | null
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_interviews: {
        Row: {
          anon_user_id: string
          created_at: string
          id: string
          interview_id: string
        }
        Insert: {
          anon_user_id: string
          created_at?: string
          id?: string
          interview_id: string
        }
        Update: {
          anon_user_id?: string
          created_at?: string
          id?: string
          interview_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_interviews_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_profiles: {
        Row: {
          bio: string | null
          created_at: string
          email: string | null
          experience_years: number | null
          full_name: string | null
          id: string
          linkedin_url: string | null
          phone: string | null
          portfolio_url: string | null
          resume_url: string | null
          skills: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          email?: string | null
          experience_years?: number | null
          full_name?: string | null
          id?: string
          linkedin_url?: string | null
          phone?: string | null
          portfolio_url?: string | null
          resume_url?: string | null
          skills?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          email?: string | null
          experience_years?: number | null
          full_name?: string | null
          id?: string
          linkedin_url?: string | null
          phone?: string | null
          portfolio_url?: string | null
          resume_url?: string | null
          skills?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      interview_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          interview_id: string
          role: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          interview_id: string
          role: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          interview_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_messages_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          candidate_email: string
          candidate_name: string | null
          candidate_notes: string | null
          candidate_resume_url: string | null
          candidate_user_id: string | null
          completed_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          interview_url: string | null
          job_id: string | null
          job_role: string
          recording_url: string | null
          recruiter_id: string
          score: number | null
          started_at: string | null
          status: string
          time_limit_minutes: number | null
          transcript_summary: string | null
        }
        Insert: {
          candidate_email: string
          candidate_name?: string | null
          candidate_notes?: string | null
          candidate_resume_url?: string | null
          candidate_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          interview_url?: string | null
          job_id?: string | null
          job_role: string
          recording_url?: string | null
          recruiter_id: string
          score?: number | null
          started_at?: string | null
          status?: string
          time_limit_minutes?: number | null
          transcript_summary?: string | null
        }
        Update: {
          candidate_email?: string
          candidate_name?: string | null
          candidate_notes?: string | null
          candidate_resume_url?: string | null
          candidate_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          interview_url?: string | null
          job_id?: string | null
          job_role?: string
          recording_url?: string | null
          recruiter_id?: string
          score?: number | null
          started_at?: string | null
          status?: string
          time_limit_minutes?: number | null
          transcript_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interviews_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          created_at: string
          department: string | null
          description: string | null
          id: string
          job_type: string | null
          location: string | null
          recruiter_id: string
          salary_range: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          description?: string | null
          id?: string
          job_type?: string | null
          location?: string | null
          recruiter_id: string
          salary_range?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          description?: string | null
          id?: string
          job_type?: string | null
          location?: string | null
          recruiter_id?: string
          salary_range?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      onboarding_reminders: {
        Row: {
          id: string
          reminder_type: string
          sent_at: string
          tasks_pending: string[]
          user_id: string
        }
        Insert: {
          id?: string
          reminder_type: string
          sent_at?: string
          tasks_pending: string[]
          user_id: string
        }
        Update: {
          id?: string
          reminder_type?: string
          sent_at?: string
          tasks_pending?: string[]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          brand_color: string | null
          company_name: string | null
          created_at: string
          email: string | null
          email_cta_text: string | null
          email_intro: string | null
          email_tips: string | null
          full_name: string | null
          id: string
          logo_url: string | null
          subscription_status:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          subscription_updated_at: string | null
          updated_at: string
        }
        Insert: {
          brand_color?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          email_cta_text?: string | null
          email_intro?: string | null
          email_tips?: string | null
          full_name?: string | null
          id: string
          logo_url?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          subscription_updated_at?: string | null
          updated_at?: string
        }
        Update: {
          brand_color?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          email_cta_text?: string | null
          email_intro?: string | null
          email_tips?: string | null
          full_name?: string | null
          id?: string
          logo_url?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          subscription_updated_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          candidate_phone: string
          created_at: string
          delivered_at: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          interview_id: string
          message_id: string | null
          read_at: string | null
          sent_at: string
          status: string
          updated_at: string
        }
        Insert: {
          candidate_phone: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          interview_id: string
          message_id?: string | null
          read_at?: string | null
          sent_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          candidate_phone?: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          interview_id?: string
          message_id?: string | null
          read_at?: string | null
          sent_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_api_key: {
        Args: { p_name: string }
        Returns: {
          api_key_id: string
          full_key: string
        }[]
      }
      get_candidate_interview_safe: {
        Args: { p_interview_id: string }
        Returns: {
          candidate_notes: string
          candidate_resume_url: string
          completed_at: string
          expires_at: string
          id: string
          job_role: string
          score: number
          started_at: string
          status: string
          time_limit_minutes: number
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
      insert_interview_message: {
        Args: { p_content: string; p_interview_id: string; p_role: string }
        Returns: string
      }
      update_interview_recording: {
        Args: { p_interview_id: string; p_recording_url: string }
        Returns: undefined
      }
      update_interview_status: {
        Args: { p_interview_id: string; p_score?: number; p_status: string }
        Returns: undefined
      }
      validate_api_key: {
        Args: { p_api_key: string }
        Returns: {
          api_key_id: string
          error_message: string
          is_valid: boolean
          rate_limit_remaining: number
          scopes: string[]
          user_id: string
        }[]
      }
    }
    Enums: {
      api_key_status: "active" | "revoked" | "expired"
      subscription_status: "free" | "paid" | "enterprise"
      user_role: "recruiter" | "candidate" | "admin"
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
      api_key_status: ["active", "revoked", "expired"],
      subscription_status: ["free", "paid", "enterprise"],
      user_role: ["recruiter", "candidate", "admin"],
    },
  },
} as const
