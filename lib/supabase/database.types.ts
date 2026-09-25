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
      announcement_audiences: {
        Row: {
          announcement_id: string
          group_id: string
          organization_id: string
        }
        Insert: {
          announcement_id: string
          group_id: string
          organization_id: string
        }
        Update: {
          announcement_id?: string
          group_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_audiences_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_audiences_announcement_org_fk"
            columns: ["announcement_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "announcement_audiences_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_audiences_group_org_fk"
            columns: ["group_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "announcement_audiences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_exclusions: {
        Row: {
          announcement_id: string
          created_at: string
          membership_id: string
          organization_id: string
        }
        Insert: {
          announcement_id: string
          created_at?: string
          membership_id: string
          organization_id: string
        }
        Update: {
          announcement_id?: string
          created_at?: string
          membership_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_exclusions_announcement_id_organization_id_fkey"
            columns: ["announcement_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "announcement_exclusions_membership_id_organization_id_fkey"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      announcement_individual_audiences: {
        Row: {
          announcement_id: string
          created_at: string
          membership_id: string
          organization_id: string
        }
        Insert: {
          announcement_id: string
          created_at?: string
          membership_id: string
          organization_id: string
        }
        Update: {
          announcement_id?: string
          created_at?: string
          membership_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_individual_audie_announcement_id_organization_fkey"
            columns: ["announcement_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "announcement_individual_audie_membership_id_organization_i_fkey"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience_mode: string
          author_membership_id: string
          body: string
          client_reference: string
          created_at: string
          id: string
          organization_id: string
          priority: string
          published_at: string | null
          sms_fallback_after_minutes: number | null
          status: Database["public"]["Enums"]["announcement_status"]
          title: string
          updated_at: string
        }
        Insert: {
          audience_mode?: string
          author_membership_id: string
          body: string
          client_reference?: string
          created_at?: string
          id?: string
          organization_id: string
          priority?: string
          published_at?: string | null
          sms_fallback_after_minutes?: number | null
          status?: Database["public"]["Enums"]["announcement_status"]
          title: string
          updated_at?: string
        }
        Update: {
          audience_mode?: string
          author_membership_id?: string
          body?: string
          client_reference?: string
          created_at?: string
          id?: string
          organization_id?: string
          priority?: string
          published_at?: string | null
          sms_fallback_after_minutes?: number | null
          status?: Database["public"]["Enums"]["announcement_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_membership_id_fkey"
            columns: ["author_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          id: number
          metadata: Json
          occurred_at: string
          organization_id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          id?: never
          metadata?: Json
          occurred_at?: string
          organization_id: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          id?: never
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      authority_grants: {
        Row: {
          can_publish: boolean
          created_at: string
          expires_at: string | null
          granted_by: string
          group_id: string
          id: string
          membership_id: string
          organization_id: string
          revoked_at: string | null
        }
        Insert: {
          can_publish?: boolean
          created_at?: string
          expires_at?: string | null
          granted_by: string
          group_id: string
          id?: string
          membership_id: string
          organization_id: string
          revoked_at?: string | null
        }
        Update: {
          can_publish?: boolean
          created_at?: string
          expires_at?: string | null
          granted_by?: string
          group_id?: string
          id?: string
          membership_id?: string
          organization_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "authority_grants_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authority_grants_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authority_grants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_attempts: {
        Row: {
          attempted_at: string
          channel: Database["public"]["Enums"]["delivery_channel"]
          client_reference: string
          failure_code: string | null
          id: string
          last_status_checked_at: string | null
          organization_id: string
          provider: string | null
          provider_message_id: string | null
          provider_response_code: string | null
          provider_status: string | null
          provider_updated_at: string | null
          rate_minor: number | null
          recipient_delivery_id: string
          status: Database["public"]["Enums"]["delivery_status"]
          unit_count: number | null
        }
        Insert: {
          attempted_at?: string
          channel: Database["public"]["Enums"]["delivery_channel"]
          client_reference?: string
          failure_code?: string | null
          id?: string
          last_status_checked_at?: string | null
          organization_id: string
          provider?: string | null
          provider_message_id?: string | null
          provider_response_code?: string | null
          provider_status?: string | null
          provider_updated_at?: string | null
          rate_minor?: number | null
          recipient_delivery_id: string
          status: Database["public"]["Enums"]["delivery_status"]
          unit_count?: number | null
        }
        Update: {
          attempted_at?: string
          channel?: Database["public"]["Enums"]["delivery_channel"]
          client_reference?: string
          failure_code?: string | null
          id?: string
          last_status_checked_at?: string | null
          organization_id?: string
          provider?: string | null
          provider_message_id?: string | null
          provider_response_code?: string | null
          provider_status?: string | null
          provider_updated_at?: string | null
          rate_minor?: number | null
          recipient_delivery_id?: string
          status?: Database["public"]["Enums"]["delivery_status"]
          unit_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_attempts_recipient_delivery_id_fkey"
            columns: ["recipient_delivery_id"]
            isOneToOne: false
            referencedRelation: "recipient_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string
          group_id: string
          membership_id: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          membership_id: string
          organization_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          membership_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by: string
          group_type: string
          id: string
          name: string
          organization_id: string
          parent_group_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          group_type: string
          id?: string
          name: string
          organization_id: string
          parent_group_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          group_type?: string
          id?: string
          name?: string
          organization_id?: string
          parent_group_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_parent_group_id_fkey"
            columns: ["parent_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          error_count: number
          id: string
          organization_id: string
          row_count: number
          source: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          error_count?: number
          id?: string
          organization_id: string
          row_count?: number
          source: string
          status: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          error_count?: number
          id?: string
          organization_id?: string
          row_count?: number
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "imports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string
          email: string | null
          expires_at: string
          id: string
          intended_role: Database["public"]["Enums"]["membership_role"]
          organization_id: string
          phone_e164: string | null
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          expires_at: string
          id?: string
          intended_role?: Database["public"]["Enums"]["membership_role"]
          organization_id: string
          phone_e164?: string | null
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          expires_at?: string
          id?: string
          intended_role?: Database["public"]["Enums"]["membership_role"]
          organization_id?: string
          phone_e164?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          hierarchy_rank: number
          id: string
          joined_at: string | null
          member_reference: string | null
          organization_id: string
          role: Database["public"]["Enums"]["membership_role"]
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hierarchy_rank?: number
          id?: string
          joined_at?: string | null
          member_reference?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hierarchy_rank?: number
          id?: string
          joined_at?: string | null
          member_reference?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_branding: {
        Row: {
          logo_path: string | null
          organization_id: string
          primary_color: string
          secondary_color: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          logo_path?: string | null
          organization_id: string
          primary_color?: string
          secondary_color?: string | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          logo_path?: string | null
          organization_id?: string
          primary_color?: string
          secondary_color?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_branding_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_sms_settings: {
        Row: {
          daily_spend_limit_minor: number | null
          fallback_after_minutes: number
          fallback_enabled: boolean
          organization_id: string
          provider: string
          sender_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          daily_spend_limit_minor?: number | null
          fallback_after_minutes?: number
          fallback_enabled?: boolean
          organization_id: string
          provider?: string
          sender_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          daily_spend_limit_minor?: number | null
          fallback_after_minutes?: number
          fallback_enabled?: boolean
          organization_id?: string
          provider?: string
          sender_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_sms_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          code: string
          created_at: string
          created_by: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          phone_e164: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          phone_e164?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          phone_e164?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      read_receipts: {
        Row: {
          membership_id: string
          organization_id: string
          read_at: string
          recipient_delivery_id: string
        }
        Insert: {
          membership_id: string
          organization_id: string
          read_at?: string
          recipient_delivery_id: string
        }
        Update: {
          membership_id?: string
          organization_id?: string
          read_at?: string
          recipient_delivery_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "read_receipts_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "read_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "read_receipts_recipient_delivery_id_fkey"
            columns: ["recipient_delivery_id"]
            isOneToOne: true
            referencedRelation: "recipient_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      recipient_deliveries: {
        Row: {
          announcement_id: string
          created_at: string
          id: string
          in_app_status: Database["public"]["Enums"]["delivery_status"]
          membership_id: string
          organization_id: string
          sms_fallback_due_at: string | null
          sms_status: Database["public"]["Enums"]["delivery_status"] | null
        }
        Insert: {
          announcement_id: string
          created_at?: string
          id?: string
          in_app_status?: Database["public"]["Enums"]["delivery_status"]
          membership_id: string
          organization_id: string
          sms_fallback_due_at?: string | null
          sms_status?: Database["public"]["Enums"]["delivery_status"] | null
        }
        Update: {
          announcement_id?: string
          created_at?: string
          id?: string
          in_app_status?: Database["public"]["Enums"]["delivery_status"]
          membership_id?: string
          organization_id?: string
          sms_fallback_due_at?: string | null
          sms_status?: Database["public"]["Enums"]["delivery_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "recipient_deliveries_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipient_deliveries_announcement_org_fk"
            columns: ["announcement_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "recipient_deliveries_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipient_deliveries_membership_org_fk"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "recipient_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_ledger: {
        Row: {
          amount_minor: number
          announcement_id: string | null
          created_at: string
          currency: string
          entry_type: string
          id: string
          organization_id: string
          provider_reference: string | null
        }
        Insert: {
          amount_minor: number
          announcement_id?: string | null
          created_at?: string
          currency?: string
          entry_type: string
          id?: string
          organization_id: string
          provider_reference?: string | null
        }
        Update: {
          amount_minor?: number
          announcement_id?: string | null
          created_at?: string
          currency?: string
          entry_type?: string
          id?: string
          organization_id?: string
          provider_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_ledger_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      update_organization_identity: {
        Args: {
          target_code: string
          target_logo_path?: string
          target_name: string
          target_organization: string
          target_primary_color: string
          target_secondary_color: string
        }
        Returns: undefined
      }
    }
    Enums: {
      announcement_status: "draft" | "published" | "cancelled"
      delivery_channel: "in_app" | "sms"
      delivery_status:
        | "pending"
        | "queued"
        | "sent"
        | "delivered"
        | "failed"
        | "read"
        | "cancelled"
      membership_role: "owner" | "authority" | "member"
      membership_status: "invited" | "active" | "suspended" | "removed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      announcement_status: ["draft", "published", "cancelled"],
      delivery_channel: ["in_app", "sms"],
      delivery_status: [
        "pending",
        "queued",
        "sent",
        "delivered",
        "failed",
        "read",
        "cancelled",
      ],
      membership_role: ["owner", "authority", "member"],
      membership_status: ["invited", "active", "suspended", "removed"],
    },
  },
} as const
