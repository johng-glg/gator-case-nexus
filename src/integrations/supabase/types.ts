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
  public: {
    Tables: {
      calendar_event_links: {
        Row: {
          calendar_id: string
          case_id: string
          google_event_id: string
          key: string
          sig: string
          updated_at: string
        }
        Insert: {
          calendar_id: string
          case_id: string
          google_event_id: string
          key: string
          sig: string
          updated_at?: string
        }
        Update: {
          calendar_id?: string
          case_id?: string
          google_event_id?: string
          key?: string
          sig?: string
          updated_at?: string
        }
        Relationships: []
      }
      case_activity_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          case_id: string | null
          created_at: string
          engagement_id: string | null
          id: string
          metadata: Json
          summary: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          case_id?: string | null
          created_at?: string
          engagement_id?: string | null
          id?: string
          metadata?: Json
          summary: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          case_id?: string | null
          created_at?: string
          engagement_id?: string | null
          id?: string
          metadata?: Json
          summary?: string
        }
        Relationships: []
      }
      case_document_status: {
        Row: {
          case_id: string
          doc_code: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          case_id: string
          doc_code: string
          status: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          case_id?: string
          doc_code?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      client_messaging_consent: {
        Row: {
          client_id: string
          email_consent_at: string | null
          email_consent_source: string | null
          email_consent_text: string | null
          email_opted_out_at: string | null
          sms_consent_text: string | null
          sms_opt_in: boolean
          sms_opt_in_at: string | null
          sms_opt_in_source: string | null
          sms_opted_out_at: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          email_consent_at?: string | null
          email_consent_source?: string | null
          email_consent_text?: string | null
          email_opted_out_at?: string | null
          sms_consent_text?: string | null
          sms_opt_in?: boolean
          sms_opt_in_at?: string | null
          sms_opt_in_source?: string | null
          sms_opted_out_at?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          email_consent_at?: string | null
          email_consent_source?: string | null
          email_consent_text?: string | null
          email_opted_out_at?: string | null
          sms_consent_text?: string | null
          sms_opt_in?: boolean
          sms_opt_in_at?: string | null
          sms_opt_in_source?: string | null
          sms_opted_out_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      client_portal_links: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string | null
          updated_at: string
          user_id: string
          zoho_case_id: string | null
          zoho_engagement_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          updated_at?: string
          user_id: string
          zoho_case_id?: string | null
          zoho_engagement_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          updated_at?: string
          user_id?: string
          zoho_case_id?: string | null
          zoho_engagement_id?: string | null
        }
        Relationships: []
      }
      document_requests: {
        Row: {
          canceled_at: string | null
          case_id: string
          created_at: string
          created_by: string | null
          created_by_email: string | null
          engagement_id: string | null
          fulfilled_at: string | null
          id: string
          instructions: string | null
          label: string
          status: string
        }
        Insert: {
          canceled_at?: string | null
          case_id: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          engagement_id?: string | null
          fulfilled_at?: string | null
          id?: string
          instructions?: string | null
          label: string
          status?: string
        }
        Update: {
          canceled_at?: string | null
          case_id?: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          engagement_id?: string | null
          fulfilled_at?: string | null
          id?: string
          instructions?: string | null
          label?: string
          status?: string
        }
        Relationships: []
      }
      document_uploads: {
        Row: {
          case_id: string
          id: string
          mime_type: string | null
          original_name: string
          request_id: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_at: string
          uploaded_by_email: string | null
          uploaded_by_user: string | null
        }
        Insert: {
          case_id: string
          id?: string
          mime_type?: string | null
          original_name: string
          request_id?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_at?: string
          uploaded_by_email?: string | null
          uploaded_by_user?: string | null
        }
        Update: {
          case_id?: string
          id?: string
          mime_type?: string | null
          original_name?: string
          request_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_at?: string
          uploaded_by_email?: string | null
          uploaded_by_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_uploads_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "document_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      held_messages: {
        Row: {
          body: string
          case_id: string
          channel: string
          client_id: string | null
          created_at: string
          cta_label: string | null
          cta_url: string | null
          discarded_at: string | null
          discarded_by: string | null
          id: string
          msg_key: string
          reason: string
          recipient_email: string
          sent_at: string | null
          sent_by: string | null
          subject: string
        }
        Insert: {
          body: string
          case_id: string
          channel?: string
          client_id?: string | null
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          discarded_at?: string | null
          discarded_by?: string | null
          id?: string
          msg_key: string
          reason: string
          recipient_email: string
          sent_at?: string | null
          sent_by?: string | null
          subject: string
        }
        Update: {
          body?: string
          case_id?: string
          channel?: string
          client_id?: string | null
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          discarded_at?: string | null
          discarded_by?: string | null
          id?: string
          msg_key?: string
          reason?: string
          recipient_email?: string
          sent_at?: string | null
          sent_by?: string | null
          subject?: string
        }
        Relationships: []
      }
      medical_records_sweep_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          open_count: number
          ran_at: string
          stale_count: number
          tasks_created: number
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          open_count?: number
          ran_at?: string
          stale_count?: number
          tasks_created?: number
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          open_count?: number
          ran_at?: string
          stale_count?: number
          tasks_created?: number
        }
        Relationships: []
      }
      messaging_settings: {
        Row: {
          enabled_milestones: Json
          id: boolean
          sms_enabled: boolean
          updated_at: string
        }
        Insert: {
          enabled_milestones?: Json
          id?: boolean
          sms_enabled?: boolean
          updated_at?: string
        }
        Update: {
          enabled_milestones?: Json
          id?: boolean
          sms_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      saved_views: {
        Row: {
          created_at: string
          id: string
          name: string
          page: string
          params: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          page: string
          params?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          page?: string
          params?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ssdi_deadline_digests: {
        Row: {
          calendar_created: number | null
          calendar_deleted: number | null
          calendar_errors: number | null
          calendar_updated: number | null
          created_at: string
          due_soon: Json
          error: string | null
          id: string
          overdue: Json
          ran_at: string
          release_expiring: Json
          scanned: number
          updated: number
        }
        Insert: {
          calendar_created?: number | null
          calendar_deleted?: number | null
          calendar_errors?: number | null
          calendar_updated?: number | null
          created_at?: string
          due_soon?: Json
          error?: string | null
          id?: string
          overdue?: Json
          ran_at?: string
          release_expiring?: Json
          scanned?: number
          updated?: number
        }
        Update: {
          calendar_created?: number | null
          calendar_deleted?: number | null
          calendar_errors?: number | null
          calendar_updated?: number | null
          created_at?: string
          due_soon?: Json
          error?: string | null
          id?: string
          overdue?: Json
          ran_at?: string
          release_expiring?: Json
          scanned?: number
          updated?: number
        }
        Relationships: []
      }
      ssdi_stage_requirements: {
        Row: {
          created_at: string
          fields: Json
          stage: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          fields?: Json
          stage: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          fields?: Json
          stage?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      zoho_firm_tokens: {
        Row: {
          access_token: string | null
          access_token_expires_at: string | null
          client_id: string | null
          client_secret: string | null
          created_at: string
          key: string
          last_rotated_at: string | null
          last_verified_at: string | null
          refresh_tail: string | null
          refresh_token: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          access_token_expires_at?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          key: string
          last_rotated_at?: string | null
          last_verified_at?: string | null
          refresh_tail?: string | null
          refresh_token?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          access_token_expires_at?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          key?: string
          last_rotated_at?: string | null
          last_verified_at?: string | null
          refresh_tail?: string | null
          refresh_token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      zoho_tokens: {
        Row: {
          access_token: string | null
          access_token_expires_at: string | null
          created_at: string
          refresh_token: string
          updated_at: string
          user_id: string
          zoho_user_id: string | null
        }
        Insert: {
          access_token?: string | null
          access_token_expires_at?: string | null
          created_at?: string
          refresh_token: string
          updated_at?: string
          user_id: string
          zoho_user_id?: string | null
        }
        Update: {
          access_token?: string | null
          access_token_expires_at?: string | null
          created_at?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
          zoho_user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "staff"
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
      app_role: ["admin", "staff"],
    },
  },
} as const
