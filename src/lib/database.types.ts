/**
 * Generated from the local database by `npm run generate:types`. Do not edit by
 * hand: change the migration, reset the local stack, and regenerate.
 *
 * Used for the names and argument types of tables and functions. The return
 * types of functions that `return table (...)` are not trustworthy here - the
 * generator marks every column non-null - so each feature declares its own row
 * type, with the nullability the SQL actually has.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      bats: {
        Row: {
          id: string;
          owner_id: string;
          slot: number;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          owner_id: string;
          slot: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          slot?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bats_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
        };
        ComputedFields: never;
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blocks_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocks_blocker_id_fkey';
            columns: ['blocker_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      cities: {
        Row: {
          country_code: string;
          id: number;
          latitude: number;
          longitude: number;
          name: string;
          population: number;
          search_index: string;
        };
        ComputedFields: never;
        Insert: {
          country_code: string;
          id: number;
          latitude: number;
          longitude: number;
          name: string;
          population?: number;
          search_index: string;
        };
        Update: {
          country_code?: string;
          id?: number;
          latitude?: number;
          longitude?: number;
          name?: string;
          population?: number;
          search_index?: string;
        };
        Relationships: [];
      };
      friendships: {
        Row: {
          accepted_at: string | null;
          addressee_id: string;
          created_at: string;
          id: string;
          requester_id: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          addressee_id: string;
          created_at?: string;
          id?: string;
          requester_id: string;
          status?: string;
        };
        Update: {
          accepted_at?: string | null;
          addressee_id?: string;
          created_at?: string;
          id?: string;
          requester_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'friendships_addressee_id_fkey';
            columns: ['addressee_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'friendships_requester_id_fkey';
            columns: ['requester_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          bat_id: string;
          body: string;
          client_ref: string | null;
          deliver_at: string;
          delivered_at: string | null;
          destination_city_id: number;
          distance_km: number;
          id: string;
          opened_at: string | null;
          origin_city_id: number;
          recipient_id: string;
          sender_id: string;
          sent_at: string;
        };
        ComputedFields: never;
        Insert: {
          bat_id: string;
          body: string;
          client_ref?: string | null;
          deliver_at: string;
          delivered_at?: string | null;
          destination_city_id: number;
          distance_km: number;
          id?: string;
          opened_at?: string | null;
          origin_city_id: number;
          recipient_id: string;
          sender_id: string;
          sent_at?: string;
        };
        Update: {
          bat_id?: string;
          body?: string;
          client_ref?: string | null;
          deliver_at?: string;
          delivered_at?: string | null;
          destination_city_id?: number;
          distance_km?: number;
          id?: string;
          opened_at?: string | null;
          origin_city_id?: number;
          recipient_id?: string;
          sender_id?: string;
          sent_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_bat_id_fkey';
            columns: ['bat_id'];
            isOneToOne: false;
            referencedRelation: 'bats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_destination_city_id_fkey';
            columns: ['destination_city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_origin_city_id_fkey';
            columns: ['origin_city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          city_changed_at: string | null;
          city_id: number | null;
          created_at: string;
          display_name: string;
          id: string;
          settled_city_id: number | null;
          updated_at: string;
          username: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          city_changed_at?: string | null;
          city_id?: number | null;
          created_at?: string;
          display_name: string;
          id: string;
          settled_city_id?: number | null;
          updated_at?: string;
          username: string;
        };
        Update: {
          avatar_url?: string | null;
          city_changed_at?: string | null;
          city_id?: number | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          settled_city_id?: number | null;
          updated_at?: string;
          username?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profiles_settled_city_id_fkey';
            columns: ['settled_city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          id: string;
          letter_body: string | null;
          letter_sent_at: string | null;
          message_id: string | null;
          note: string | null;
          reason: string;
          reported_display_name: string | null;
          reported_id: string | null;
          reported_username: string;
          reporter_id: string | null;
          resolution: string | null;
          resolved_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          letter_body?: string | null;
          letter_sent_at?: string | null;
          message_id?: string | null;
          note?: string | null;
          reason: string;
          reported_display_name?: string | null;
          reported_id?: string | null;
          reported_username: string;
          reporter_id?: string | null;
          resolution?: string | null;
          resolved_at?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          letter_body?: string | null;
          letter_sent_at?: string | null;
          message_id?: string | null;
          note?: string | null;
          reason?: string;
          reported_display_name?: string | null;
          reported_id?: string | null;
          reported_username?: string;
          reporter_id?: string | null;
          resolution?: string | null;
          resolved_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_reported_id_fkey';
            columns: ['reported_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_friend: { Args: { friendship_id: string }; Returns: undefined };
      block_courier: { Args: { courier_id: string }; Returns: string };
      delete_own_account: { Args: Record<PropertyKey, never>; Returns: undefined };
      get_badges: {
        Args: Record<PropertyKey, never>;
        Returns: {
          friend_requests: number;
          unread_messages: number;
        }[];
      };
      get_roost: {
        Args: Record<PropertyKey, never>;
        Returns: {
          bat_id: string;
          deliver_at: string;
          distance_km: number;
          message_id: string;
          recipient_display_name: string;
          recipient_id: string;
          recipient_username: string;
          sent_at: string;
          slot: number;
          status: string;
        }[];
      };
      list_blocked: {
        Args: Record<PropertyKey, never>;
        Returns: {
          blocked_at: string;
          courier_id: string;
          username: string;
        }[];
      };
      list_friends: {
        Args: Record<PropertyKey, never>;
        Returns: {
          accepted_at: string;
          city_name: string;
          country_code: string;
          direction: string;
          display_name: string;
          distance_km: number;
          flight_seconds: number;
          friend_id: string;
          friendship_id: string;
          requested_at: string;
          status: string;
          username: string;
        }[];
      };
      list_inbox: {
        Args: { max_results?: number; older_than?: string };
        Returns: {
          arrived_at: string;
          distance_km: number;
          message_id: string;
          opened_at: string;
          origin_city_name: string;
          origin_country_code: string;
          preview: string;
          sender_display_name: string;
          sender_id: string;
          sender_username: string;
          sent_at: string;
        }[];
      };
      list_sent: {
        Args: { max_results?: number; older_than?: string };
        Returns: {
          deliver_at: string;
          delivered: boolean;
          destination_city_name: string;
          destination_country_code: string;
          distance_km: number;
          message_id: string;
          preview: string;
          recipient_display_name: string;
          recipient_id: string;
          recipient_username: string;
          sent_at: string;
        }[];
      };
      read_message: {
        Args: { message_id: string };
        Returns: {
          body: string;
          deliver_at: string;
          delivered: boolean;
          destination_city_name: string;
          destination_country_code: string;
          direction: string;
          distance_km: number;
          id: string;
          opened_at: string;
          origin_city_name: string;
          origin_country_code: string;
          other_display_name: string;
          other_id: string;
          other_username: string;
          sent_at: string;
        }[];
      };
      remove_friend: { Args: { friendship_id: string }; Returns: undefined };
      report_courier: {
        Args: { also_block?: boolean; courier_id: string; note?: string; reason: string };
        Returns: string;
      };
      report_letter: {
        Args: { also_block?: boolean; message_id: string; note?: string; reason: string };
        Returns: string;
      };
      request_friend: { Args: { username: string }; Returns: string };
      search_cities: {
        Args: { folded_query: string; max_results?: number };
        Returns: {
          country_code: string;
          id: number;
          name: string;
          population: number;
        }[];
      };
      send_message: {
        Args: { body: string; client_ref?: string; recipient_id: string };
        Returns: {
          deliver_at: string;
          distance_km: number;
          message_id: string;
        }[];
      };
      unblock_courier: { Args: { courier_id: string }; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
