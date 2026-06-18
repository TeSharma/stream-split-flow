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
      content_items: {
        Row: {
          body_excerpt: string | null
          contributor_id: string
          created_at: string
          ghost_post_id: string | null
          id: string
          metadata: Json
          stream_id: string
          title: string
          type: string
        }
        Insert: {
          body_excerpt?: string | null
          contributor_id: string
          created_at?: string
          ghost_post_id?: string | null
          id?: string
          metadata?: Json
          stream_id: string
          title: string
          type: string
        }
        Update: {
          body_excerpt?: string | null
          contributor_id?: string
          created_at?: string
          ghost_post_id?: string | null
          id?: string
          metadata?: Json
          stream_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "contributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
        ]
      }
      contributors: {
        Row: {
          created_at: string
          ghost_author_id: string | null
          id: string
          name: string
          role: string
          team_id: string
          user_id: string | null
          wallet_address: string | null
        }
        Insert: {
          created_at?: string
          ghost_author_id?: string | null
          id?: string
          name: string
          role?: string
          team_id: string
          user_id?: string | null
          wallet_address?: string | null
        }
        Update: {
          created_at?: string
          ghost_author_id?: string | null
          id?: string
          name?: string
          role?: string
          team_id?: string
          user_id?: string | null
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contributors_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount_cents: number
          currency: string
          ghost_event_id: string | null
          ghost_subscription_id: string | null
          id: string
          idempotency_key: string | null
          received_at: string
          status: string
          stream_id: string
          subscriber_email: string | null
        }
        Insert: {
          amount_cents: number
          currency?: string
          ghost_event_id?: string | null
          ghost_subscription_id?: string | null
          id?: string
          idempotency_key?: string | null
          received_at?: string
          status?: string
          stream_id: string
          subscriber_email?: string | null
        }
        Update: {
          amount_cents?: number
          currency?: string
          ghost_event_id?: string | null
          ghost_subscription_id?: string | null
          id?: string
          idempotency_key?: string | null
          received_at?: string
          status?: string
          stream_id?: string
          subscriber_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount_usdc: number
          circle_tx_id: string | null
          confirmed_at: string | null
          contributor_id: string
          created_at: string
          destination_address: string | null
          error: string | null
          id: string
          payment_event_id: string
          status: string
          submitted_at: string | null
          tx_hash: string | null
        }
        Insert: {
          amount_usdc: number
          circle_tx_id?: string | null
          confirmed_at?: string | null
          contributor_id: string
          created_at?: string
          destination_address?: string | null
          error?: string | null
          id?: string
          payment_event_id: string
          status?: string
          submitted_at?: string | null
          tx_hash?: string | null
        }
        Update: {
          amount_usdc?: number
          circle_tx_id?: string | null
          confirmed_at?: string | null
          contributor_id?: string
          created_at?: string
          destination_address?: string | null
          error?: string | null
          id?: string
          payment_event_id?: string
          status?: string
          submitted_at?: string | null
          tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "contributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_payment_event_id_fkey"
            columns: ["payment_event_id"]
            isOneToOne: false
            referencedRelation: "payment_events"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      split_proposals: {
        Row: {
          ai_percentages: Json
          ai_rationale: string | null
          approved_at: string | null
          approved_by: string | null
          approved_percentages: Json | null
          created_at: string
          id: string
          payment_event_id: string
          status: string
        }
        Insert: {
          ai_percentages: Json
          ai_rationale?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_percentages?: Json | null
          created_at?: string
          id?: string
          payment_event_id: string
          status?: string
        }
        Update: {
          ai_percentages?: Json
          ai_rationale?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_percentages?: Json | null
          created_at?: string
          id?: string
          payment_event_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_proposals_payment_event_id_fkey"
            columns: ["payment_event_id"]
            isOneToOne: true
            referencedRelation: "payment_events"
            referencedColumns: ["id"]
          },
        ]
      }
      streams: {
        Row: {
          created_at: string
          ghost_site_url: string | null
          id: string
          name: string
          source: string
          status: string
          team_id: string
          webhook_secret: string
        }
        Insert: {
          created_at?: string
          ghost_site_url?: string | null
          id?: string
          name: string
          source?: string
          status?: string
          team_id: string
          webhook_secret?: string
        }
        Update: {
          created_at?: string
          ghost_site_url?: string | null
          id?: string
          name?: string
          source?: string
          status?: string
          team_id?: string
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "streams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
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
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_team_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _team_id: string
          _user_id: string
        }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "member"
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
      app_role: ["owner", "member"],
    },
  },
} as const
