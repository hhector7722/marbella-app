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
      ai_call_logs: {
        Row: {
          created_at: string
          duration_seconds: number | null
          id: string
          raw_transcript: string | null
          session_id: string | null
          summary: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          raw_transcript?: string | null
          session_id?: string | null
          summary?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          raw_transcript?: string | null
          session_id?: string | null
          summary?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_messages: {
        Row: {
          content_type: string
          created_at: string
          id: string
          media_url: string | null
          role: string
          session_id: string | null
          text_content: string | null
          user_id: string
          voice_call_id: string | null
        }
        Insert: {
          content_type?: string
          created_at?: string
          id?: string
          media_url?: string | null
          role: string
          session_id?: string | null
          text_content?: string | null
          user_id: string
          voice_call_id?: string | null
        }
        Update: {
          content_type?: string
          created_at?: string
          id?: string
          media_url?: string | null
          role?: string
          session_id?: string | null
          text_content?: string | null
          user_id?: string
          voice_call_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_sessions: {
        Row: {
          created_at: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_usage_events: {
        Row: {
          created_at: string
          duration_ms: number | null
          event_type: Database["public"]["Enums"]["app_usage_event_type"]
          id: string
          label: string | null
          metadata: Json
          path: string | null
          profile_id: string
          referrer_path: string | null
          search: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          event_type: Database["public"]["Enums"]["app_usage_event_type"]
          id?: string
          label?: string | null
          metadata?: Json
          path?: string | null
          profile_id: string
          referrer_path?: string | null
          search?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          event_type?: Database["public"]["Enums"]["app_usage_event_type"]
          id?: string
          label?: string | null
          metadata?: Json
          path?: string | null
          profile_id?: string
          referrer_path?: string | null
          search?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_usage_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bdp_articulos: {
        Row: {
          coste: number | null
          departamento_id: number | null
          envia_a_kds: boolean | null
          familia_id: number | null
          id: number
          nombre: string
          precio_base: number | null
        }
        Insert: {
          coste?: number | null
          departamento_id?: number | null
          envia_a_kds?: boolean | null
          familia_id?: number | null
          id: number
          nombre: string
          precio_base?: number | null
        }
        Update: {
          coste?: number | null
          departamento_id?: number | null
          envia_a_kds?: boolean | null
          familia_id?: number | null
          id?: number
          nombre?: string
          precio_base?: number | null
        }
        Relationships: []
      }
      bdp_cash_movements: {
        Row: {
          amount: number
          concept_code: number
          created_at: string
          fecha_negocio: string
          id: string
          movement_date: string
          raw_json: Json
        }
        Insert: {
          amount: number
          concept_code: number
          created_at?: string
          fecha_negocio: string
          id?: string
          movement_date: string
          raw_json?: Json
        }
        Update: {
          amount?: number
          concept_code?: number
          created_at?: string
          fecha_negocio?: string
          id?: string
          movement_date?: string
          raw_json?: Json
        }
        Relationships: []
      }
      bdp_departamentos: {
        Row: {
          envia_a_kds: boolean | null
          id: number
          nombre: string
        }
        Insert: {
          envia_a_kds?: boolean | null
          id: number
          nombre: string
        }
        Update: {
          envia_a_kds?: boolean | null
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      bdp_familias: {
        Row: {
          departamento_id: number | null
          id: number
          nombre: string
        }
        Insert: {
          departamento_id?: number | null
          id: number
          nombre: string
        }
        Update: {
          departamento_id?: number | null
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      carta_editors: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carta_editors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      carta_ui_labels: {
        Row: {
          created_at: string
          id: string
          racion_entero_ca: string
          racion_entero_en: string
          racion_entero_es: string
          racion_medio_ca: string
          racion_medio_en: string
          racion_medio_es: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          racion_entero_ca?: string
          racion_entero_en?: string
          racion_entero_es?: string
          racion_medio_ca?: string
          racion_medio_en?: string
          racion_medio_es?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          racion_entero_ca?: string
          racion_entero_en?: string
          racion_entero_es?: string
          racion_medio_ca?: string
          racion_medio_en?: string
          racion_medio_es?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      cash_box_inventory: {
        Row: {
          box_id: string | null
          denomination: number
          id: string
          quantity: number | null
        }
        Insert: {
          box_id?: string | null
          denomination: number
          id?: string
          quantity?: number | null
        }
        Update: {
          box_id?: string | null
          denomination?: number
          id?: string
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_box_inventory_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "cash_boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_boxes: {
        Row: {
          created_at: string | null
          current_balance: number | null
          id: string
          image_url: string | null
          name: string
          target_balance: number | null
          type: string
        }
        Insert: {
          created_at?: string | null
          current_balance?: number | null
          id?: string
          image_url?: string | null
          name: string
          target_balance?: number | null
          type: string
        }
        Update: {
          created_at?: string | null
          current_balance?: number | null
          id?: string
          image_url?: string | null
          name?: string
          target_balance?: number | null
          type?: string
        }
        Relationships: []
      }
      cash_closings: {
        Row: {
          bdp_closing_ticket_photo_path: string | null
          breakdown: Json | null
          card_payments: number | null
          cash_counted: number | null
          cash_expected: number | null
          cash_left: number | null
          cash_withdrawn: number | null
          closed_at: string
          closed_by: string | null
          closing_date: string
          collections: number | null
          created_at: string | null
          dataphone_totals_photo_path: string | null
          debt_recovered: number | null
          difference: number | null
          id: string
          net_sales: number | null
          notes: string | null
          operations_count: number | null
          pending_payments: number | null
          processed: boolean | null
          sales_card: number | null
          sales_pending: number | null
          shift: string | null
          status: string | null
          tickets_count: number | null
          tpv_sales: number
          tpv_terminal: string | null
          updated_at: string | null
          weather: string | null
        }
        Insert: {
          bdp_closing_ticket_photo_path?: string | null
          breakdown?: Json | null
          card_payments?: number | null
          cash_counted?: number | null
          cash_expected?: number | null
          cash_left?: number | null
          cash_withdrawn?: number | null
          closed_at?: string
          closed_by?: string | null
          closing_date: string
          collections?: number | null
          created_at?: string | null
          dataphone_totals_photo_path?: string | null
          debt_recovered?: number | null
          difference?: number | null
          id?: string
          net_sales?: number | null
          notes?: string | null
          operations_count?: number | null
          pending_payments?: number | null
          processed?: boolean | null
          sales_card?: number | null
          sales_pending?: number | null
          shift?: string | null
          status?: string | null
          tickets_count?: number | null
          tpv_sales: number
          tpv_terminal?: string | null
          updated_at?: string | null
          weather?: string | null
        }
        Update: {
          bdp_closing_ticket_photo_path?: string | null
          breakdown?: Json | null
          card_payments?: number | null
          cash_counted?: number | null
          cash_expected?: number | null
          cash_left?: number | null
          cash_withdrawn?: number | null
          closed_at?: string
          closed_by?: string | null
          closing_date?: string
          collections?: number | null
          created_at?: string | null
          dataphone_totals_photo_path?: string | null
          debt_recovered?: number | null
          difference?: number | null
          id?: string
          net_sales?: number | null
          notes?: string | null
          operations_count?: number | null
          pending_payments?: number | null
          processed?: boolean | null
          sales_card?: number | null
          sales_pending?: number | null
          shift?: string | null
          status?: string | null
          tickets_count?: number | null
          tpv_sales?: number
          tpv_terminal?: string | null
          updated_at?: string | null
          weather?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          cover_articulo_id: number | null
          cover_photo_scale: string | null
          cover_photo_url: string | null
          id: string
          name: string
          parent_id: string | null
          scope: string
          slug: string | null
          sort_order: number | null
        }
        Insert: {
          cover_articulo_id?: number | null
          cover_photo_scale?: string | null
          cover_photo_url?: string | null
          id?: string
          name: string
          parent_id?: string | null
          scope?: string
          slug?: string | null
          sort_order?: number | null
        }
        Update: {
          cover_articulo_id?: number | null
          cover_photo_scale?: string | null
          cover_photo_url?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          scope?: string
          slug?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_cover_articulo_id_fkey"
            columns: ["cover_articulo_id"]
            isOneToOne: false
            referencedRelation: "bdp_articulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_cover_articulo_id_fkey"
            columns: ["cover_articulo_id"]
            isOneToOne: false
            referencedRelation: "v_digital_menu_items"
            referencedColumns: ["articulo_id"]
          },
          {
            foreignKeyName: "categories_cover_articulo_id_fkey"
            columns: ["cover_articulo_id"]
            isOneToOne: false
            referencedRelation: "v_public_menu_items"
            referencedColumns: ["articulo_id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      comandero_events: {
        Row: {
          articulo_id: number | null
          cantidad_delta: number
          created_at: string | null
          id: string
          mesa: string | null
          notas: string | null
          numero_documento: string
          order_id: string | null
          procesado_kds: boolean | null
          producto_nombre: string
        }
        Insert: {
          articulo_id?: number | null
          cantidad_delta: number
          created_at?: string | null
          id?: string
          mesa?: string | null
          notas?: string | null
          numero_documento: string
          order_id?: string | null
          procesado_kds?: boolean | null
          producto_nombre: string
        }
        Update: {
          articulo_id?: number | null
          cantidad_delta?: number
          created_at?: string | null
          id?: string
          mesa?: string | null
          notas?: string | null
          numero_documento?: string
          order_id?: string | null
          procesado_kds?: boolean | null
          producto_nombre?: string
        }
        Relationships: []
      }
      denominations_log: {
        Row: {
          closing_id: string | null
          count_type: string | null
          created_at: string | null
          denomination: number
          id: string
          ledger_entry_id: string | null
          quantity: number
          subtotal: number
        }
        Insert: {
          closing_id?: string | null
          count_type?: string | null
          created_at?: string | null
          denomination: number
          id?: string
          ledger_entry_id?: string | null
          quantity?: number
          subtotal: number
        }
        Update: {
          closing_id?: string | null
          count_type?: string | null
          created_at?: string | null
          denomination?: number
          id?: string
          ledger_entry_id?: string | null
          quantity?: number
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "denominations_log_closing_id_fkey"
            columns: ["closing_id"]
            isOneToOne: false
            referencedRelation: "cash_closings"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_menu_overrides: {
        Row: {
          articulo_id: number
          carta_dual_racion_enabled: boolean
          carta_photo_scale: string
          carta_racion_entero_ca: string | null
          carta_racion_entero_en: string | null
          carta_racion_entero_es: string | null
          carta_racion_medio_ca: string | null
          carta_racion_medio_en: string | null
          carta_racion_medio_es: string | null
          category_id: string | null
          created_at: string
          created_by: string
          is_hidden: boolean
          override_descripcion: string | null
          override_nombre: string | null
          override_nombre_ca: string | null
          override_nombre_en: string | null
          override_nombre_es: string | null
          override_photo_url: string | null
          override_precio: number | null
          override_precio_medio: number | null
          plato_marbella_hide_name: boolean
          plato_marbella_is_menu_price: boolean
          plato_marbella_slot: string | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          articulo_id: number
          carta_dual_racion_enabled?: boolean
          carta_photo_scale?: string
          carta_racion_entero_ca?: string | null
          carta_racion_entero_en?: string | null
          carta_racion_entero_es?: string | null
          carta_racion_medio_ca?: string | null
          carta_racion_medio_en?: string | null
          carta_racion_medio_es?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string
          is_hidden?: boolean
          override_descripcion?: string | null
          override_nombre?: string | null
          override_nombre_ca?: string | null
          override_nombre_en?: string | null
          override_nombre_es?: string | null
          override_photo_url?: string | null
          override_precio?: number | null
          override_precio_medio?: number | null
          plato_marbella_hide_name?: boolean
          plato_marbella_is_menu_price?: boolean
          plato_marbella_slot?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          articulo_id?: number
          carta_dual_racion_enabled?: boolean
          carta_photo_scale?: string
          carta_racion_entero_ca?: string | null
          carta_racion_entero_en?: string | null
          carta_racion_entero_es?: string | null
          carta_racion_medio_ca?: string | null
          carta_racion_medio_en?: string | null
          carta_racion_medio_es?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string
          is_hidden?: boolean
          override_descripcion?: string | null
          override_nombre?: string | null
          override_nombre_ca?: string | null
          override_nombre_en?: string | null
          override_nombre_es?: string | null
          override_photo_url?: string | null
          override_precio?: number | null
          override_precio_medio?: number | null
          plato_marbella_hide_name?: boolean
          plato_marbella_is_menu_price?: boolean
          plato_marbella_slot?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_menu_overrides_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: true
            referencedRelation: "bdp_articulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_menu_overrides_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: true
            referencedRelation: "v_digital_menu_items"
            referencedColumns: ["articulo_id"]
          },
          {
            foreignKeyName: "digital_menu_overrides_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: true
            referencedRelation: "v_public_menu_items"
            referencedColumns: ["articulo_id"]
          },
          {
            foreignKeyName: "digital_menu_overrides_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          codigo_empleado: string
          created_at: string | null
          filename: string
          id: string
          mes: string | null
          public_url: string | null
          storage_path: string
          tipo: string
          user_id: string
          year: number | null
        }
        Insert: {
          codigo_empleado: string
          created_at?: string | null
          filename: string
          id?: string
          mes?: string | null
          public_url?: string | null
          storage_path: string
          tipo?: string
          user_id: string
          year?: number | null
        }
        Update: {
          codigo_empleado?: string
          created_at?: string | null
          filename?: string
          id?: string
          mes?: string | null
          public_url?: string | null
          storage_path?: string
          tipo?: string
          user_id?: string
          year?: number | null
        }
        Relationships: []
      }
      estado_sala: {
        Row: {
          id: number
          id_ticket: string | null
          mesas_activas: number | null
          radiografia_completa: Json | null
          total_mesas: number | null
          ultima_actualizacion: string | null
        }
        Insert: {
          id?: number
          id_ticket?: string | null
          mesas_activas?: number | null
          radiografia_completa?: Json | null
          total_mesas?: number | null
          ultima_actualizacion?: string | null
        }
        Update: {
          id?: number
          id_ticket?: string | null
          mesas_activas?: number | null
          radiografia_completa?: Json | null
          total_mesas?: number | null
          ultima_actualizacion?: string | null
        }
        Relationships: []
      }
      event_default_pack: {
        Row: {
          id: string
          items: Json
          label: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id: string
          items: Json
          label: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          items?: Json
          label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      event_orders: {
        Row: {
          created_at: string
          event_id: string
          id: string
          items: Json
          notes: string | null
          responsible_name: string
          status: string
          total_amount: number | null
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          items: Json
          notes?: string | null
          responsible_name: string
          status?: string
          total_amount?: number | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          items?: Json
          notes?: string | null
          responsible_name?: string
          status?: string
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_products: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          price: number
          product_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price: number
          product_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          category_limits: Json | null
          created_at: string
          created_by: string | null
          description: string | null
          enabled_product_ids: string[] | null
          event_date: string
          event_time: string
          guest_count: number | null
          id: string
          is_active: boolean
          name: string
          pack_items: Json | null
          reservation_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          category_limits?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled_product_ids?: string[] | null
          event_date: string
          event_time: string
          guest_count?: number | null
          id?: string
          is_active?: boolean
          name: string
          pack_items?: Json | null
          reservation_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          category_limits?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled_product_ids?: string[] | null
          event_date?: string
          event_time?: string
          guest_count?: number | null
          id?: string
          is_active?: boolean
          name?: string
          pack_items?: Json | null
          reservation_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_monthly_costs: {
        Row: {
          active_from: string
          active_to: string | null
          amount: number
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active_from?: string
          active_to?: string | null
          amount: number
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active_from?: string
          active_to?: string | null
          amount?: number
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      import_runs: {
        Row: {
          created_at: string
          errors: Json
          file_hash_sha256: string | null
          file_name: string | null
          id: string
          record_count: number | null
          result_message: string | null
          step: string
          success: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          errors?: Json
          file_hash_sha256?: string | null
          file_name?: string | null
          id?: string
          record_count?: number | null
          result_message?: string | null
          step: string
          success?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          errors?: Json
          file_hash_sha256?: string | null
          file_name?: string | null
          id?: string
          record_count?: number | null
          result_message?: string | null
          step?: string
          success?: boolean
          user_id?: string
        }
        Relationships: []
      }
      ingredient_price_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          ingredient_id: string
          new_price: number
          old_price: number
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          ingredient_id: string
          new_price: number
          old_price: number
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          ingredient_id?: string
          new_price?: number
          old_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_price_history_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          allergens: string[] | null
          base_unit: string
          category: string
          created_at: string | null
          current_price: number
          id: string
          image_url: string | null
          inventory_visible: boolean
          name: string
          order_unit: string | null
          pack_price: number | null
          pack_unit_size_qty: number | null
          pack_unit_size_unit: string | null
          pack_units: number | null
          price_locked: boolean
          purchase_unit: string
          recipe_unit: string
          recommended_stock: number | null
          stock_current: number | null
          supplier: string | null
          supplier_2: string | null
          supplier_id: string | null
          supplier_pricing_mode: string
          unit: string | null
          unit_type: string
          updated_at: string | null
          waste_percentage: number | null
        }
        Insert: {
          allergens?: string[] | null
          base_unit?: string
          category?: string
          created_at?: string | null
          current_price: number
          id?: string
          image_url?: string | null
          inventory_visible?: boolean
          name: string
          order_unit?: string | null
          pack_price?: number | null
          pack_unit_size_qty?: number | null
          pack_unit_size_unit?: string | null
          pack_units?: number | null
          price_locked?: boolean
          purchase_unit: string
          recipe_unit?: string
          recommended_stock?: number | null
          stock_current?: number | null
          supplier?: string | null
          supplier_2?: string | null
          supplier_id?: string | null
          supplier_pricing_mode?: string
          unit?: string | null
          unit_type: string
          updated_at?: string | null
          waste_percentage?: number | null
        }
        Update: {
          allergens?: string[] | null
          base_unit?: string
          category?: string
          created_at?: string | null
          current_price?: number
          id?: string
          image_url?: string | null
          inventory_visible?: boolean
          name?: string
          order_unit?: string | null
          pack_price?: number | null
          pack_unit_size_qty?: number | null
          pack_unit_size_unit?: string | null
          pack_units?: number | null
          price_locked?: boolean
          purchase_unit?: string
          recipe_unit?: string
          recommended_stock?: number | null
          stock_current?: number | null
          supplier?: string | null
          supplier_2?: string | null
          supplier_id?: string | null
          supplier_pricing_mode?: string
          unit?: string | null
          unit_type?: string
          updated_at?: string | null
          waste_percentage?: number | null
        }
        Relationships: []
      }
      kds_events: {
        Row: {
          articulo_id: number | null
          created_at: string
          event_type: string
          id: string
          id_ticket: string
          mesa: string | null
          notas: string | null
          payload: Json
          producto_nombre: string | null
          qty: number
          source: string
          source_event_id: string | null
        }
        Insert: {
          articulo_id?: number | null
          created_at?: string
          event_type: string
          id?: string
          id_ticket: string
          mesa?: string | null
          notas?: string | null
          payload?: Json
          producto_nombre?: string | null
          qty?: number
          source: string
          source_event_id?: string | null
        }
        Update: {
          articulo_id?: number | null
          created_at?: string
          event_type?: string
          id?: string
          id_ticket?: string
          mesa?: string | null
          notas?: string | null
          payload?: Json
          producto_nombre?: string | null
          qty?: number
          source?: string
          source_event_id?: string | null
        }
        Relationships: []
      }
      kds_order_lines: {
        Row: {
          articulo_id: number | null
          cantidad: number | null
          completed_at: string | null
          created_at: string | null
          departamento: string | null
          estado: Database["public"]["Enums"]["kds_item_status"] | null
          id: string
          kds_order_id: string | null
          mesa: string | null
          nombre: string | null
          notas: string | null
          numero_documento: string | null
          order_id: string | null
          precio: number | null
          producto_nombre: string | null
          status: string | null
          unidades: number | null
        }
        Insert: {
          articulo_id?: number | null
          cantidad?: number | null
          completed_at?: string | null
          created_at?: string | null
          departamento?: string | null
          estado?: Database["public"]["Enums"]["kds_item_status"] | null
          id?: string
          kds_order_id?: string | null
          mesa?: string | null
          nombre?: string | null
          notas?: string | null
          numero_documento?: string | null
          order_id?: string | null
          precio?: number | null
          producto_nombre?: string | null
          status?: string | null
          unidades?: number | null
        }
        Update: {
          articulo_id?: number | null
          cantidad?: number | null
          completed_at?: string | null
          created_at?: string | null
          departamento?: string | null
          estado?: Database["public"]["Enums"]["kds_item_status"] | null
          id?: string
          kds_order_id?: string | null
          mesa?: string | null
          nombre?: string | null
          notas?: string | null
          numero_documento?: string | null
          order_id?: string | null
          precio?: number | null
          producto_nombre?: string | null
          status?: string | null
          unidades?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kds_order_lines_kds_order_id_fkey"
            columns: ["kds_order_id"]
            isOneToOne: false
            referencedRelation: "kds_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      kds_orders: {
        Row: {
          completed_at: string | null
          created_at: string | null
          estado: Database["public"]["Enums"]["kds_order_status"] | null
          id: string
          id_ticket: string | null
          mesa: string
          nombre_cliente: string | null
          notas_comanda: string | null
          origen: string | null
          origen_referencia: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          estado?: Database["public"]["Enums"]["kds_order_status"] | null
          id?: string
          id_ticket?: string | null
          mesa: string
          nombre_cliente?: string | null
          notas_comanda?: string | null
          origen?: string | null
          origen_referencia?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          estado?: Database["public"]["Enums"]["kds_order_status"] | null
          id?: string
          id_ticket?: string | null
          mesa?: string
          nombre_cliente?: string | null
          notas_comanda?: string | null
          origen?: string | null
          origen_referencia?: string | null
          status?: string | null
        }
        Relationships: []
      }
      kds_projection_lines: {
        Row: {
          articulo_id: number
          id_ticket: string
          last_event_at: string
          notas_norm: string
          producto_nombre: string | null
          qty_added: number
          qty_cancel_notice: number
          qty_done: number
        }
        Insert: {
          articulo_id: number
          id_ticket: string
          last_event_at?: string
          notas_norm?: string
          producto_nombre?: string | null
          qty_added?: number
          qty_cancel_notice?: number
          qty_done?: number
        }
        Update: {
          articulo_id?: number
          id_ticket?: string
          last_event_at?: string
          notas_norm?: string
          producto_nombre?: string | null
          qty_added?: number
          qty_cancel_notice?: number
          qty_done?: number
        }
        Relationships: []
      }
      kds_projection_orders: {
        Row: {
          completed_at: string | null
          estado: string
          id_ticket: string
          last_event_at: string
          mesa: string | null
          notas_comanda: string | null
          opened_at: string
        }
        Insert: {
          completed_at?: string | null
          estado?: string
          id_ticket: string
          last_event_at?: string
          mesa?: string | null
          notas_comanda?: string | null
          opened_at?: string
        }
        Update: {
          completed_at?: string | null
          estado?: string
          id_ticket?: string
          last_event_at?: string
          mesa?: string | null
          notas_comanda?: string | null
          opened_at?: string
        }
        Relationships: []
      }
      kds_ticket_state: {
        Row: {
          id_ticket: string
          kitchen_state: string
          manual_completed_at: string | null
          updated_at: string
        }
        Insert: {
          id_ticket: string
          kitchen_state: string
          manual_completed_at?: string | null
          updated_at?: string
        }
        Update: {
          id_ticket?: string
          kitchen_state?: string
          manual_completed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      manager_ledger: {
        Row: {
          amount: number
          concept: string
          created_by: string
          date: string
          id: string
          movement_type: string
        }
        Insert: {
          amount: number
          concept: string
          created_by?: string
          date?: string
          id?: string
          movement_type: string
        }
        Update: {
          amount?: number
          concept?: string
          created_by?: string
          date?: string
          id?: string
          movement_type?: string
        }
        Relationships: []
      }
      map_tpv_receta: {
        Row: {
          articulo_id: number
          factor_porcion: number | null
          recipe_id: string
        }
        Insert: {
          articulo_id: number
          factor_porcion?: number | null
          recipe_id: string
        }
        Update: {
          articulo_id?: number
          factor_porcion?: number | null
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_recipe"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_recipe"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_digital_menu_items"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "fk_recipe"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_public_menu_items"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "map_tpv_receta_articulo_fk"
            columns: ["articulo_id"]
            isOneToOne: true
            referencedRelation: "bdp_articulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_tpv_receta_articulo_fk"
            columns: ["articulo_id"]
            isOneToOne: true
            referencedRelation: "v_digital_menu_items"
            referencedColumns: ["articulo_id"]
          },
          {
            foreignKeyName: "map_tpv_receta_articulo_fk"
            columns: ["articulo_id"]
            isOneToOne: true
            referencedRelation: "v_public_menu_items"
            referencedColumns: ["articulo_id"]
          },
        ]
      }
      menu_category_overrides: {
        Row: {
          category_id: string
          created_at: string
          override_name_ca: string | null
          override_name_en: string | null
          override_name_es: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          category_id: string
          created_at?: string
          override_name_ca?: string | null
          override_name_en?: string | null
          override_name_es?: string | null
          updated_at?: string
          updated_by?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          override_name_ca?: string | null
          override_name_en?: string | null
          override_name_es?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_category_overrides_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: true
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      nominas: {
        Row: {
          created_at: string | null
          empleado_id: string
          file_path: string
          id: string
          mes_anio: string
        }
        Insert: {
          created_at?: string | null
          empleado_id: string
          file_path: string
          id?: string
          mes_anio: string
        }
        Update: {
          created_at?: string | null
          empleado_id?: string
          file_path?: string
          id?: string
          mes_anio?: string
        }
        Relationships: []
      }
      nominas_excepciones: {
        Row: {
          created_at: string | null
          error_log: string | null
          file_name: string | null
          file_path_temp: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          error_log?: string | null
          file_name?: string | null
          file_path_temp?: string | null
          id?: string
        }
        Update: {
          created_at?: string | null
          error_log?: string | null
          file_name?: string | null
          file_path_temp?: string | null
          id?: string
        }
        Relationships: []
      }
      order_drafts: {
        Row: {
          ingredient_id: string
          quantity: number
          supplier_id: number
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          ingredient_id: string
          quantity: number
          supplier_id: number
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          ingredient_id?: string
          quantity?: number
          supplier_id?: number
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_drafts_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_drafts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      pavilion_activity_sheets: {
        Row: {
          activity_date: string
          created_at: string
          file_path: string
          gmail_message_id: string | null
          id: string
          original_filename: string | null
          source: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          activity_date: string
          created_at?: string
          file_path: string
          gmail_message_id?: string | null
          id?: string
          original_filename?: string | null
          source?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          activity_date?: string
          created_at?: string
          file_path?: string
          gmail_message_id?: string | null
          id?: string
          original_filename?: string | null
          source?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pavilion_activity_sheets_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_monthly_totals: {
        Row: {
          created_at: string
          email_date: string | null
          file_path: string
          id: string
          period_end: string
          period_start: string
          period_ym: string
          total_company_cost: number
        }
        Insert: {
          created_at?: string
          email_date?: string | null
          file_path: string
          id?: string
          period_end: string
          period_start: string
          period_ym: string
          total_company_cost: number
        }
        Update: {
          created_at?: string
          email_date?: string | null
          file_path?: string
          id?: string
          period_end?: string
          period_start?: string
          period_ym?: string
          total_company_cost?: number
        }
        Relationships: []
      }
      profile_labor_cost_terms: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          monthly_cost: number
          overtime_cost_per_hour: number
          user_id: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          monthly_cost?: number
          overtime_cost_per_hour?: number
          user_id: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          monthly_cost?: number
          overtime_cost_per_hour?: number
          user_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_labor_cost_terms_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_greeting_style: string | null
          avatar_url: string | null
          bank_account: string | null
          codigo_empleado: string | null
          contracted_hours_weekly: number | null
          created_at: string | null
          dni: string | null
          email: string | null
          end_date: string | null
          first_name: string | null
          hours_balance: number | null
          id: string
          is_fixed_salary: boolean | null
          is_supervisor: boolean | null
          joining_date: string | null
          last_display_mode: string | null
          last_display_mode_at: string | null
          last_name: string | null
          monthly_cost: number | null
          needs_onboarding: boolean | null
          overtime_cost_per_hour: number | null
          phone: string | null
          prefer_stock_hours: boolean | null
          preferred_language: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          ai_greeting_style?: string | null
          avatar_url?: string | null
          bank_account?: string | null
          codigo_empleado?: string | null
          contracted_hours_weekly?: number | null
          created_at?: string | null
          dni?: string | null
          email?: string | null
          end_date?: string | null
          first_name?: string | null
          hours_balance?: number | null
          id: string
          is_fixed_salary?: boolean | null
          is_supervisor?: boolean | null
          joining_date?: string | null
          last_display_mode?: string | null
          last_display_mode_at?: string | null
          last_name?: string | null
          monthly_cost?: number | null
          needs_onboarding?: boolean | null
          overtime_cost_per_hour?: number | null
          phone?: string | null
          prefer_stock_hours?: boolean | null
          preferred_language?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_greeting_style?: string | null
          avatar_url?: string | null
          bank_account?: string | null
          codigo_empleado?: string | null
          contracted_hours_weekly?: number | null
          created_at?: string | null
          dni?: string | null
          email?: string | null
          end_date?: string | null
          first_name?: string | null
          hours_balance?: number | null
          id?: string
          is_fixed_salary?: boolean | null
          is_supervisor?: boolean | null
          joining_date?: string | null
          last_display_mode?: string | null
          last_display_mode_at?: string | null
          last_name?: string | null
          monthly_cost?: number | null
          needs_onboarding?: boolean | null
          overtime_cost_per_hour?: number | null
          phone?: string | null
          prefer_stock_hours?: boolean | null
          preferred_language?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      purchase_invoice_attachments: {
        Row: {
          content_sha256: string
          created_at: string
          created_by: string | null
          file_path: string
          id: string
          invoice_id: string
          page_order: number
        }
        Insert: {
          content_sha256: string
          created_at?: string
          created_by?: string | null
          file_path: string
          id?: string
          invoice_id: string
          page_order?: number
        }
        Update: {
          content_sha256?: string
          created_at?: string
          created_by?: string | null
          file_path?: string
          id?: string
          invoice_id?: string
          page_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoice_attachments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoice_lines: {
        Row: {
          base_price: number | null
          id: string
          invoice_id: string | null
          line_unit: string | null
          mapped_ingredient_id: string | null
          original_name: string
          quantity: number | null
          status: string | null
          tax_rate: number | null
          total_price: number | null
          unit_price: number | null
        }
        Insert: {
          base_price?: number | null
          id?: string
          invoice_id?: string | null
          line_unit?: string | null
          mapped_ingredient_id?: string | null
          original_name: string
          quantity?: number | null
          status?: string | null
          tax_rate?: number | null
          total_price?: number | null
          unit_price?: number | null
        }
        Update: {
          base_price?: number | null
          id?: string
          invoice_id?: string | null
          line_unit?: string | null
          mapped_ingredient_id?: string | null
          original_name?: string
          quantity?: number | null
          status?: string | null
          tax_rate?: number | null
          total_price?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_lines_mapped_ingredient_id_fkey"
            columns: ["mapped_ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          base_amount: number | null
          content_sha256: string | null
          created_at: string | null
          created_by: string | null
          duplicate_of_invoice_id: string | null
          file_path: string
          id: string
          invoice_date: string | null
          invoice_number: string | null
          source: string
          status: string
          supplier_id: number | null
          tax_amount: number | null
          tax_rate: number | null
          total_amount: number | null
        }
        Insert: {
          base_amount?: number | null
          content_sha256?: string | null
          created_at?: string | null
          created_by?: string | null
          duplicate_of_invoice_id?: string | null
          file_path: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          source?: string
          status?: string
          supplier_id?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          total_amount?: number | null
        }
        Update: {
          base_amount?: number | null
          content_sha256?: string | null
          created_at?: string | null
          created_by?: string | null
          duplicate_of_invoice_id?: string | null
          file_path?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          source?: string
          status?: string
          supplier_id?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_duplicate_of_invoice_id_fkey"
            columns: ["duplicate_of_invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string | null
          id: string
          ingredient_id: string
          ingredient_name: string | null
          line_total: number | null
          notes: string | null
          purchase_order_id: string
          quantity: number
          unit: string
          unit_price: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ingredient_id: string
          ingredient_name?: string | null
          line_total?: number | null
          notes?: string | null
          purchase_order_id: string
          quantity: number
          unit: string
          unit_price?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ingredient_id?: string
          ingredient_name?: string | null
          line_total?: number | null
          notes?: string | null
          purchase_order_id?: string
          quantity?: number
          unit?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string | null
          created_by: string | null
          expected_delivery_date: string | null
          id: string
          notes: string | null
          order_date: string
          order_number: string | null
          pdf_url: string | null
          status: string
          supplier_id: string
          supplier_name: string | null
          total_amount: number | null
          total_items: number | null
          updated_at: string | null
          voice_recorded_at: string | null
          voice_transcription: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          order_number?: string | null
          pdf_url?: string | null
          status?: string
          supplier_id: string
          supplier_name?: string | null
          total_amount?: number | null
          total_items?: number | null
          updated_at?: string | null
          voice_recorded_at?: string | null
          voice_transcription?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          order_number?: string | null
          pdf_url?: string | null
          status?: string
          supplier_id?: string
          supplier_name?: string | null
          total_amount?: number | null
          total_items?: number | null
          updated_at?: string | null
          voice_recorded_at?: string | null
          voice_transcription?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          id: string
          subscription: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          subscription: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          subscription?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          id: string
          ingredient_id: string
          quantity_gross: number
          quantity_half: number | null
          quantity_net: number | null
          recipe_id: string
          umb_multiplier: number
          unit: string
        }
        Insert: {
          id?: string
          ingredient_id: string
          quantity_gross: number
          quantity_half?: number | null
          quantity_net?: number | null
          recipe_id: string
          umb_multiplier?: number
          unit: string
        }
        Update: {
          id?: string
          ingredient_id?: string
          quantity_gross?: number
          quantity_half?: number | null
          quantity_net?: number | null
          recipe_id?: string
          umb_multiplier?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_digital_menu_items"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_public_menu_items"
            referencedColumns: ["recipe_id"]
          },
        ]
      }
      recipes: {
        Row: {
          articulo_id: number | null
          category: string | null
          created_at: string | null
          elaboration: string | null
          elaboration_video_url: string | null
          embedding: string | null
          has_half_ration: boolean | null
          id: string
          menu_category_id: string | null
          name: string
          photo_url: string | null
          preparation_time: number | null
          presentation: string | null
          price_pavello_half: number | null
          sale_price: number | null
          sale_price_half: number | null
          sale_price_half_pavello: number | null
          sales_price_pavello: number | null
          servings: number | null
          target_food_cost_pct: number | null
          updated_at: string | null
          video_tutorial_url: string | null
        }
        Insert: {
          articulo_id?: number | null
          category?: string | null
          created_at?: string | null
          elaboration?: string | null
          elaboration_video_url?: string | null
          embedding?: string | null
          has_half_ration?: boolean | null
          id?: string
          menu_category_id?: string | null
          name: string
          photo_url?: string | null
          preparation_time?: number | null
          presentation?: string | null
          price_pavello_half?: number | null
          sale_price?: number | null
          sale_price_half?: number | null
          sale_price_half_pavello?: number | null
          sales_price_pavello?: number | null
          servings?: number | null
          target_food_cost_pct?: number | null
          updated_at?: string | null
          video_tutorial_url?: string | null
        }
        Update: {
          articulo_id?: number | null
          category?: string | null
          created_at?: string | null
          elaboration?: string | null
          elaboration_video_url?: string | null
          embedding?: string | null
          has_half_ration?: boolean | null
          id?: string
          menu_category_id?: string | null
          name?: string
          photo_url?: string | null
          preparation_time?: number | null
          presentation?: string | null
          price_pavello_half?: number | null
          sale_price?: number | null
          sale_price_half?: number | null
          sale_price_half_pavello?: number | null
          sales_price_pavello?: number | null
          servings?: number | null
          target_food_cost_pct?: number | null
          updated_at?: string | null
          video_tutorial_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipes_menu_category_id_fkey"
            columns: ["menu_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          created_at: string
          customer_name: string
          customer_phone: string
          id: string
          notes: string | null
          pax: number
          reservation_date: string
          reservation_time: string
          status: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          customer_phone: string
          id?: string
          notes?: string | null
          pax: number
          reservation_date: string
          reservation_time: string
          status?: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          customer_phone?: string
          id?: string
          notes?: string | null
          pax?: number
          reservation_date?: string
          reservation_time?: string
          status?: string
        }
        Relationships: []
      }
      shifts: {
        Row: {
          activity: string | null
          activity_2: string | null
          categoria: string | null
          categoria_2: string | null
          created_at: string | null
          draft_activity: string | null
          draft_activity_2: string | null
          draft_categoria: string | null
          draft_categoria_2: string | null
          draft_end_time: string | null
          draft_notes: string | null
          draft_start_time: string | null
          end_time: string
          event_end_time: string | null
          event_end_time_2: string | null
          event_participants: number | null
          event_participants_2: number | null
          event_start_time: string | null
          event_start_time_2: string | null
          id: string
          is_published: boolean | null
          notes: string | null
          start_time: string
          user_id: string
        }
        Insert: {
          activity?: string | null
          activity_2?: string | null
          categoria?: string | null
          categoria_2?: string | null
          created_at?: string | null
          draft_activity?: string | null
          draft_activity_2?: string | null
          draft_categoria?: string | null
          draft_categoria_2?: string | null
          draft_end_time?: string | null
          draft_notes?: string | null
          draft_start_time?: string | null
          end_time: string
          event_end_time?: string | null
          event_end_time_2?: string | null
          event_participants?: number | null
          event_participants_2?: number | null
          event_start_time?: string | null
          event_start_time_2?: string | null
          id?: string
          is_published?: boolean | null
          notes?: string | null
          start_time: string
          user_id: string
        }
        Update: {
          activity?: string | null
          activity_2?: string | null
          categoria?: string | null
          categoria_2?: string | null
          created_at?: string | null
          draft_activity?: string | null
          draft_activity_2?: string | null
          draft_categoria?: string | null
          draft_categoria_2?: string | null
          draft_end_time?: string | null
          draft_notes?: string | null
          draft_start_time?: string | null
          end_time?: string
          event_end_time?: string | null
          event_end_time_2?: string | null
          event_participants?: number | null
          event_participants_2?: number | null
          event_start_time?: string | null
          event_start_time_2?: string | null
          id?: string
          is_published?: boolean | null
          notes?: string | null
          start_time?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_consumption_recipe_display_order: {
        Row: {
          recipe_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          recipe_id: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          recipe_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_consumption_recipe_display_order_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: true
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_consumption_recipe_display_order_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: true
            referencedRelation: "v_digital_menu_items"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "staff_consumption_recipe_display_order_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: true
            referencedRelation: "v_public_menu_items"
            referencedColumns: ["recipe_id"]
          },
        ]
      }
      staff_consumption_register_errors: {
        Row: {
          created_at: string
          employee_id: string
          error_message: string
          id: string
          is_drink: boolean
          is_half: boolean
          quantity: number
          recipe_id: string
          recipe_name: string
          reference_doc: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          error_message: string
          id?: string
          is_drink?: boolean
          is_half?: boolean
          quantity?: number
          recipe_id: string
          recipe_name: string
          reference_doc: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          error_message?: string
          id?: string
          is_drink?: boolean
          is_half?: boolean
          quantity?: number
          recipe_id?: string
          recipe_name?: string
          reference_doc?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_consumption_register_errors_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_consumption_register_errors_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_consumption_register_errors_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_digital_menu_items"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "staff_consumption_register_errors_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_public_menu_items"
            referencedColumns: ["recipe_id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string | null
          id: string
          ingredient_id: string
          movement_date: string
          movement_type: string
          notes: string | null
          original_description: string | null
          processed_by: string | null
          quantity: number
          reference_doc: string | null
          supplier_id: string | null
          total_amount: number | null
          unit: string
          unit_price: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ingredient_id: string
          movement_date?: string
          movement_type: string
          notes?: string | null
          original_description?: string | null
          processed_by?: string | null
          quantity: number
          reference_doc?: string | null
          supplier_id?: string | null
          total_amount?: number | null
          unit: string
          unit_price?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ingredient_id?: string
          movement_date?: string
          movement_type?: string
          notes?: string | null
          original_description?: string | null
          processed_by?: string | null
          quantity?: number
          reference_doc?: string | null
          supplier_id?: string | null
          total_amount?: number | null
          unit?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_item_mappings: {
        Row: {
          conversion_factor: number
          created_at: string | null
          id: string
          ingredient_id: string | null
          last_known_price: number | null
          line_billing_unit: string | null
          line_content_qty: number | null
          line_content_unit: string | null
          supplier_id: number | null
          supplier_item_name: string
        }
        Insert: {
          conversion_factor?: number
          created_at?: string | null
          id?: string
          ingredient_id?: string | null
          last_known_price?: number | null
          line_billing_unit?: string | null
          line_content_qty?: number | null
          line_content_unit?: string | null
          supplier_id?: number | null
          supplier_item_name: string
        }
        Update: {
          conversion_factor?: number
          created_at?: string | null
          id?: string
          ingredient_id?: string | null
          last_known_price?: number | null
          line_billing_unit?: string | null
          line_content_qty?: number | null
          line_content_unit?: string | null
          supplier_id?: number | null
          supplier_item_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_item_mappings_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_item_mappings_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          created_at: string | null
          delivery_schedule: string | null
          email_domains: string[] | null
          id: number
          image_url: string | null
          lead_time: string | null
          name: string
          notes: string | null
          phone: string | null
          reliability: string | null
        }
        Insert: {
          created_at?: string | null
          delivery_schedule?: string | null
          email_domains?: string[] | null
          id?: number
          image_url?: string | null
          lead_time?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          reliability?: string | null
        }
        Update: {
          created_at?: string | null
          delivery_schedule?: string | null
          email_domains?: string[] | null
          id?: number
          image_url?: string | null
          lead_time?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          reliability?: string | null
        }
        Relationships: []
      }
      ticket_lines_marbella: {
        Row: {
          articulo_id: number
          created_at: string | null
          fecha_negocio: string
          fecha_real: string | null
          importe_total: number
          linea: number
          nombre: string | null
          numero_documento: string
          precio_unidad: number
          unidades: number
        }
        Insert: {
          articulo_id: number
          created_at?: string | null
          fecha_negocio: string
          fecha_real?: string | null
          importe_total: number
          linea: number
          nombre?: string | null
          numero_documento: string
          precio_unidad: number
          unidades: number
        }
        Update: {
          articulo_id?: number
          created_at?: string | null
          fecha_negocio?: string
          fecha_real?: string | null
          importe_total?: number
          linea?: number
          nombre?: string | null
          numero_documento?: string
          precio_unidad?: number
          unidades?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_ticket"
            columns: ["numero_documento"]
            isOneToOne: false
            referencedRelation: "tickets_marbella"
            referencedColumns: ["numero_documento"]
          },
        ]
      }
      tickets_marbella: {
        Row: {
          cobro_efectivo: number
          cobro_pendiente: number
          cobro_tarjeta: number
          created_at: string
          fecha: string
          fecha_real: string | null
          hora_cierre: string
          mesa: number | null
          numero_documento: string
          total_documento: number
        }
        Insert: {
          cobro_efectivo?: number
          cobro_pendiente?: number
          cobro_tarjeta?: number
          created_at?: string
          fecha: string
          fecha_real?: string | null
          hora_cierre: string
          mesa?: number | null
          numero_documento: string
          total_documento: number
        }
        Update: {
          cobro_efectivo?: number
          cobro_pendiente?: number
          cobro_tarjeta?: number
          created_at?: string
          fecha?: string
          fecha_real?: string | null
          hora_cierre?: string
          mesa?: number | null
          numero_documento?: string
          total_documento?: number
        }
        Relationships: []
      }
      time_logs: {
        Row: {
          clock_in: string
          clock_out: string | null
          clock_out_show_no_registrada: boolean
          created_at: string | null
          event_type: string | null
          id: string
          input_lat: number | null
          input_lng: number | null
          is_manual_entry: boolean | null
          location: string | null
          notes: string | null
          total_hours: number | null
          user_id: string
        }
        Insert: {
          clock_in: string
          clock_out?: string | null
          clock_out_show_no_registrada?: boolean
          created_at?: string | null
          event_type?: string | null
          id?: string
          input_lat?: number | null
          input_lng?: number | null
          is_manual_entry?: boolean | null
          location?: string | null
          notes?: string | null
          total_hours?: number | null
          user_id: string
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          clock_out_show_no_registrada?: boolean
          created_at?: string | null
          event_type?: string | null
          id?: string
          input_lat?: number | null
          input_lng?: number | null
          is_manual_entry?: boolean | null
          location?: string | null
          notes?: string | null
          total_hours?: number | null
          user_id?: string
        }
        Relationships: []
      }
      tip_distribution_history: {
        Row: {
          confirmed_at: string
          confirmed_by: string
          id: string
          notes: string | null
          period_end: string
          period_start: string
          weekday_total: number
          weekend_total: number
        }
        Insert: {
          confirmed_at?: string
          confirmed_by: string
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          weekday_total?: number
          weekend_total?: number
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          weekday_total?: number
          weekend_total?: number
        }
        Relationships: []
      }
      tip_distribution_lines: {
        Row: {
          distribution_id: string
          id: string
          is_sanctioned: boolean
          jornadas_con_olvido: number
          jornadas_totales: number
          penalizacion_pct: number
          tji_pct: number
          total_amount: number
          user_id: string
          weekday_amount: number
          weekday_bonus: number
          weekday_hours: number
          weekday_hours_effective: number
          weekend_amount: number
          weekend_bonus: number
          weekend_hours: number
          weekend_hours_effective: number
        }
        Insert: {
          distribution_id: string
          id?: string
          is_sanctioned?: boolean
          jornadas_con_olvido?: number
          jornadas_totales?: number
          penalizacion_pct?: number
          tji_pct?: number
          total_amount?: number
          user_id: string
          weekday_amount?: number
          weekday_bonus?: number
          weekday_hours?: number
          weekday_hours_effective?: number
          weekend_amount?: number
          weekend_bonus?: number
          weekend_hours?: number
          weekend_hours_effective?: number
        }
        Update: {
          distribution_id?: string
          id?: string
          is_sanctioned?: boolean
          jornadas_con_olvido?: number
          jornadas_totales?: number
          penalizacion_pct?: number
          tji_pct?: number
          total_amount?: number
          user_id?: string
          weekday_amount?: number
          weekday_bonus?: number
          weekday_hours?: number
          weekday_hours_effective?: number
          weekend_amount?: number
          weekend_bonus?: number
          weekend_hours?: number
          weekend_hours_effective?: number
        }
        Relationships: [
          {
            foreignKeyName: "tip_distribution_lines_distribution_id_fkey"
            columns: ["distribution_id"]
            isOneToOne: false
            referencedRelation: "tip_distribution_history"
            referencedColumns: ["id"]
          },
        ]
      }
      tip_pool_editors: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tip_pool_editors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tip_pool_overrides: {
        Row: {
          created_at: string
          created_by: string
          is_sanctioned: boolean
          notes: string | null
          override_amount: number | null
          override_hours: number | null
          pool_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          is_sanctioned?: boolean
          notes?: string | null
          override_amount?: number | null
          override_hours?: number | null
          pool_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          is_sanctioned?: boolean
          notes?: string | null
          override_amount?: number | null
          override_hours?: number | null
          pool_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tip_pool_overrides_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "tip_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_pool_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tip_pools: {
        Row: {
          cash_breakdown: Json
          cash_total: number
          created_at: string
          created_by: string
          id: string
          notes: string | null
          pool_type: string
          updated_at: string
        }
        Insert: {
          cash_breakdown?: Json
          cash_total?: number
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          pool_type: string
          updated_at?: string
        }
        Update: {
          cash_breakdown?: Json
          cash_total?: number
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          pool_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      treasury_log: {
        Row: {
          amount: number
          box_id: string | null
          breakdown: Json
          closing_id: string | null
          created_at: string | null
          exchange_group_id: string | null
          id: string
          notes: string | null
          to_box_id: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          box_id?: string | null
          breakdown?: Json
          closing_id?: string | null
          created_at?: string | null
          exchange_group_id?: string | null
          id?: string
          notes?: string | null
          to_box_id?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          box_id?: string | null
          breakdown?: Json
          closing_id?: string | null
          created_at?: string | null
          exchange_group_id?: string | null
          id?: string
          notes?: string | null
          to_box_id?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treasury_log_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "cash_boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_log_closing_id_fkey"
            columns: ["closing_id"]
            isOneToOne: false
            referencedRelation: "cash_closings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_log_to_box_id_fkey"
            columns: ["to_box_id"]
            isOneToOne: false
            referencedRelation: "cash_boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          action_url: string
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url: string
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_marbella: {
        Row: {
          articulo: string | null
          empleado: string | null
          fecha_hora: string | null
          id_linea: string
          total_importe: number | null
        }
        Insert: {
          articulo?: string | null
          empleado?: string | null
          fecha_hora?: string | null
          id_linea: string
          total_importe?: number | null
        }
        Update: {
          articulo?: string | null
          empleado?: string | null
          fecha_hora?: string | null
          id_linea?: string
          total_importe?: number | null
        }
        Relationships: []
      }
      weekly_closings_log: {
        Row: {
          closed_at: string | null
          id: number
          week_end: string
          week_start: string
        }
        Insert: {
          closed_at?: string | null
          id?: number
          week_end: string
          week_start: string
        }
        Update: {
          closed_at?: string | null
          id?: number
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      weekly_snapshots: {
        Row: {
          balance_hours: number | null
          contracted_hours_snapshot: number
          created_at: string | null
          extra_hours: number | null
          final_balance: number | null
          id: string
          is_paid: boolean | null
          ordinary_hours: number | null
          overtime_price_snapshot: number | null
          pending_balance: number | null
          prefer_stock_hours_override: boolean | null
          total_cost: number | null
          total_hours: number | null
          user_id: string
          week_end: string
          week_start: string
        }
        Insert: {
          balance_hours?: number | null
          contracted_hours_snapshot: number
          created_at?: string | null
          extra_hours?: number | null
          final_balance?: number | null
          id?: string
          is_paid?: boolean | null
          ordinary_hours?: number | null
          overtime_price_snapshot?: number | null
          pending_balance?: number | null
          prefer_stock_hours_override?: boolean | null
          total_cost?: number | null
          total_hours?: number | null
          user_id: string
          week_end: string
          week_start: string
        }
        Update: {
          balance_hours?: number | null
          contracted_hours_snapshot?: number
          created_at?: string | null
          extra_hours?: number | null
          final_balance?: number | null
          id?: string
          is_paid?: boolean | null
          ordinary_hours?: number | null
          overtime_price_snapshot?: number | null
          pending_balance?: number | null
          prefer_stock_hours_override?: boolean | null
          total_cost?: number | null
          total_hours?: number | null
          user_id?: string
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_digital_menu_items: {
        Row: {
          articulo_id: number | null
          articulo_nombre: string | null
          carta_dual_racion_enabled: boolean | null
          carta_nombre: string | null
          carta_nombre_ca: string | null
          carta_nombre_en: string | null
          carta_nombre_es: string | null
          carta_photo_scale: string | null
          carta_racion_entero_ca: string | null
          carta_racion_entero_en: string | null
          carta_racion_entero_es: string | null
          carta_racion_medio_ca: string | null
          carta_racion_medio_en: string | null
          carta_racion_medio_es: string | null
          category_child_id: string | null
          category_child_name: string | null
          category_child_name_ca: string | null
          category_child_name_en: string | null
          category_child_name_es: string | null
          category_child_slug: string | null
          category_child_sort_order: number | null
          category_id: string | null
          category_parent_cover_photo_url: string | null
          category_parent_id: string | null
          category_parent_name: string | null
          category_parent_name_ca: string | null
          category_parent_name_en: string | null
          category_parent_name_es: string | null
          category_parent_sort_order: number | null
          departamento_id: number | null
          departamento_nombre: string | null
          descripcion: string | null
          override_precio_medio: number | null
          photo_url: string | null
          plato_marbella_hide_name: boolean | null
          plato_marbella_is_menu_price: boolean | null
          plato_marbella_slot: string | null
          precio: number | null
          recipe_id: string | null
          recipe_name: string | null
          sort_order: number | null
          tpv_factor_porcion: number | null
        }
        Relationships: [
          {
            foreignKeyName: "digital_menu_overrides_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      v_manager_ledger_with_running: {
        Row: {
          amount: number | null
          concept: string | null
          created_by: string | null
          date: string | null
          id: string | null
          movement_type: string | null
          running_balance: number | null
        }
        Relationships: []
      }
      v_public_menu_items: {
        Row: {
          articulo_id: number | null
          carta_dual_racion_enabled: boolean | null
          carta_nombre: string | null
          carta_nombre_ca: string | null
          carta_nombre_en: string | null
          carta_nombre_es: string | null
          carta_photo_scale: string | null
          carta_racion_entero_ca: string | null
          carta_racion_entero_en: string | null
          carta_racion_entero_es: string | null
          carta_racion_medio_ca: string | null
          carta_racion_medio_en: string | null
          carta_racion_medio_es: string | null
          category_child_id: string | null
          category_child_name: string | null
          category_child_name_ca: string | null
          category_child_name_en: string | null
          category_child_name_es: string | null
          category_child_slug: string | null
          category_child_sort_order: number | null
          category_parent_cover_photo_url: string | null
          category_parent_id: string | null
          category_parent_name: string | null
          category_parent_name_ca: string | null
          category_parent_name_en: string | null
          category_parent_name_es: string | null
          category_parent_sort_order: number | null
          override_precio_medio: number | null
          photo_url: string | null
          plato_marbella_hide_name: boolean | null
          plato_marbella_is_menu_price: boolean | null
          plato_marbella_slot: string | null
          precio: number | null
          recipe_id: string | null
          sort_order: number | null
          tpv_factor_porcion: number | null
        }
        Relationships: []
      }
      v_treasury_movements_balance: {
        Row: {
          amount: number | null
          box_id: string | null
          breakdown: Json | null
          closing_id: string | null
          created_at: string | null
          id: string | null
          notes: string | null
          running_balance: number | null
          type: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treasury_log_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "cash_boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_log_closing_id_fkey"
            columns: ["closing_id"]
            isOneToOne: false
            referencedRelation: "cash_closings"
            referencedColumns: ["id"]
          },
        ]
      }
      view_daily_accumulated: {
        Row: {
          clock_in: string | null
          id: string | null
          running_total: number | null
          total_hours: number | null
          user_id: string | null
          week_id: string | null
          weekly_limit: number | null
        }
        Relationships: []
      }
      view_daily_hours_breakdown: {
        Row: {
          clock_in: string | null
          extra_hours: number | null
          id: string | null
          ordinary_hours: number | null
          total_hours: number | null
          user_id: string | null
          week_id: string | null
          weekly_limit: number | null
        }
        Relationships: []
      }
      view_payable_overtime: {
        Row: {
          full_name: string | null
          hours_to_pay: number | null
          id: string | null
          is_paid: boolean | null
          role: string | null
          user_id: string | null
          week_end: string | null
          week_start: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      actualizar_stock: {
        Args: { p_cantidad: number; p_producto_id: string }
        Returns: Json
      }
      asignar_roles: {
        Args: { p_role: string; p_user_id: string }
        Returns: Json
      }
      auto_map_invoice_lines_fuzzy: {
        Args: { p_invoice_id?: string; p_similarity_threshold?: number }
        Returns: Json
      }
      calcular_cierre_dia: { Args: { fecha_objetivo: string }; Returns: Json }
      can_manage_carta: { Args: never; Returns: boolean }
      can_manage_encargos: { Args: never; Returns: boolean }
      cerrar_caja: { Args: { p_usuario_id: string }; Returns: Json }
      check_purchase_invoice_duplicate: {
        Args: {
          p_content_sha256: string
          p_invoice_date: string
          p_invoice_number: string
          p_supplier_id: number
        }
        Returns: Json
      }
      close_week_for_all_users: {
        Args: { target_week_end: string; target_week_start: string }
        Returns: undefined
      }
      close_weekly_hours: { Args: { target_date?: string }; Returns: undefined }
      compute_ingredient_current_price_from_pack: {
        Args: {
          p_pack_price: number
          p_pack_unit_size_qty: number
          p_pack_unit_size_unit: string
          p_pack_units: number
          p_purchase_unit: string
        }
        Returns: number
      }
      confirm_tip_distribution: {
        Args: { p_end_date: string; p_notes?: string; p_start_date: string }
        Returns: string
      }
      consultar_cambios_entre_cajas: {
        Args: { p_fecha_fin: string; p_fecha_inicio: string }
        Returns: Json
      }
      consultar_costes_mano_obra: {
        Args: { p_fecha_fin: string; p_fecha_inicio: string }
        Returns: Json
      }
      consultar_flujos_caja_efectivo: {
        Args: { p_fecha_fin: string; p_fecha_inicio: string }
        Returns: Json
      }
      consultar_inventario: { Args: never; Returns: Json }
      consultar_manuales: { Args: { p_tema: string }; Returns: Json }
      consultar_metricas_basicas: { Args: never; Returns: Json }
      consultar_pedidos_abiertos: { Args: never; Returns: Json }
      consultar_registros_asistencia: {
        Args: { p_fecha_fin: string; p_fecha_inicio: string; p_user_id: string }
        Returns: Json
      }
      consultar_registros_horas_extras: {
        Args: { p_fecha_fin: string; p_fecha_inicio: string; p_user_id: string }
        Returns: Json
      }
      consultar_reservas: { Args: { p_fecha: string }; Returns: Json }
      consultar_usuarios: { Args: { p_filtros?: Json }; Returns: Json }
      convert_pricing_qty: {
        Args: { p_from_unit: string; p_qty: number; p_to_unit: string }
        Returns: number
      }
      crear_pedido: { Args: { p_items: Json; p_mesa: string }; Returns: Json }
      crear_usuario: { Args: { p_datos: Json }; Returns: Json }
      create_event_order: {
        Args: {
          p_items: Json
          p_notes?: string
          p_responsible_name: string
          p_slug: string
        }
        Returns: Json
      }
      create_staff_event_order: {
        Args: {
          p_event_id: string
          p_items: Json
          p_notes?: string
          p_responsible_name?: string
        }
        Returns: Json
      }
      create_user_notifications_bulk: {
        Args: {
          p_action_url: string
          p_body: string
          p_entity_id?: string
          p_entity_type?: string
          p_title: string
          p_type: string
          p_user_ids: string[]
        }
        Returns: number
      }
      create_user_notifications_system: {
        Args: {
          p_action_url: string
          p_body: string
          p_entity_id?: string
          p_entity_type?: string
          p_title: string
          p_type: string
          p_user_ids: string[]
        }
        Returns: number
      }
      create_worker_profile:
        | {
            Args: {
              p_bank_account?: string
              p_contracted_hours_weekly?: number
              p_dni?: string
              p_email?: string
              p_first_name: string
              p_last_name?: string
              p_overtime_cost_per_hour?: number
              p_role?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_contracted_hours_weekly: number
              p_email: string
              p_first_name: string
              p_joining_date?: string
              p_last_name: string
              p_overtime_cost_per_hour: number
              p_role: string
            }
            Returns: string
          }
      cron_weekly_recalculate_balances_if_madrid_summer: {
        Args: never
        Returns: undefined
      }
      cron_weekly_recalculate_balances_if_madrid_winter: {
        Args: never
        Returns: undefined
      }
      current_employee_role: { Args: never; Returns: string }
      debug_me: {
        Args: never
        Returns: {
          is_mgr: boolean
          my_auth_id: string
          my_employee_id: string
          my_role: string
        }[]
      }
      delete_stock_movements_for_albaran_line: {
        Args: { p_line_id: string }
        Returns: number
      }
      delete_stock_movements_for_purchase_invoice: {
        Args: { p_invoice_id: string }
        Returns: number
      }
      derive_base_unit: { Args: { p_purchase_unit: string }; Returns: string }
      editar_usuario: {
        Args: { p_datos: Json; p_user_id: string }
        Returns: Json
      }
      ensure_stock_movements_reference_doc_column: {
        Args: never
        Returns: undefined
      }
      fn_calculate_and_insert_delta:
        | {
            Args: {
              p_id_ticket: string
              p_mesa: string
              p_notas_comanda: string
              p_productos: Json
            }
            Returns: undefined
          }
        | {
            Args: {
              p_id_ticket: string
              p_mesa: string
              p_nombre_cliente?: string
              p_notas_comanda: string
              p_numero_documento?: string
              p_productos: Json
            }
            Returns: undefined
          }
        | {
            Args: {
              v_id_ticket: string
              v_kds_order_id: number
              v_mesa: string
              v_num_doc: string
              v_prod: Json
            }
            Returns: undefined
          }
      fn_calculate_rounded_hours: { Args: { p_hours: number }; Returns: number }
      fn_emit_kds_events_from_sala: {
        Args: {
          p_id_ticket: string
          p_mesa: string
          p_nombre_cliente?: string
          p_notas_comanda: string
          p_numero_documento?: string
          p_productos: Json
          p_timestamp_tpv?: string
        }
        Returns: undefined
      }
      fn_labor_effective_ordinary_rate: {
        Args: { p_on_date: string; p_user_id: string }
        Returns: number
      }
      fn_labor_fixed_day_for_user: {
        Args: { p_date: string; p_user_id: string }
        Returns: number
      }
      fn_labor_overtime_allocated_day: {
        Args: { p_date: string; p_user_id: string }
        Returns: number
      }
      fn_labor_term_values: {
        Args: { p_on_date: string; p_user_id: string }
        Returns: {
          monthly_cost: number
          overtime_cost_per_hour: number
        }[]
      }
      fn_parse_ticket_hora_cierre_ts: {
        Args: { p_fecha: string; p_fecha_real: string; p_hora_cierre: string }
        Returns: string
      }
      fn_recalc_and_propagate_snapshots: {
        Args: { p_start_date: string; p_user_id: string }
        Returns: undefined
      }
      fn_recipe_line_cost: {
        Args: {
          p_current_price: number
          p_pack_unit_size_qty?: number
          p_pack_unit_size_unit?: string
          p_purchase_unit: string
          p_quantity_gross: number
          p_quantity_half: number
          p_recipe_unit: string
          p_supplier_pricing_mode?: string
          p_use_half?: boolean
        }
        Returns: number
      }
      fn_round_marbella_hours: {
        Args: { total_hours: number }
        Returns: number
      }
      fn_staff_can_read_nomina: {
        Args: { p_storage_path: string }
        Returns: boolean
      }
      fn_staff_can_read_nomina_legacy: {
        Args: { p_storage_path: string }
        Returns: boolean
      }
      fn_worker_effective_overtime_rate: {
        Args: { p_on_date: string; p_user_id: string }
        Returns: number
      }
      fn_worker_hourly_rate: {
        Args: { p_event_type?: string; p_on_date: string; p_user_id: string }
        Returns: number
      }
      fncalcdelta:
        | {
            Args: {
              adoc?: string
              aid: string
              amesa: string
              anotas: string
              aprods: Json
            }
            Returns: undefined
          }
        | {
            Args: {
              adoc?: string
              aid: string
              amesa: string
              anombre_cliente?: string
              anotas: string
              aprods: Json
            }
            Returns: undefined
          }
      generar_informe_diario: { Args: { p_fecha: string }; Returns: Json }
      generar_informe_personalizado: {
        Args: { p_filtros: Json }
        Returns: Json
      }
      generar_informe_semanal: {
        Args: { p_fecha_fin: string; p_fecha_inicio: string }
        Returns: Json
      }
      gestionar_cambios_entre_cajas: {
        Args: { p_accion: string; p_datos: Json }
        Returns: Json
      }
      gestionar_carta: {
        Args: { p_accion: string; p_datos: Json }
        Returns: Json
      }
      gestionar_consumo_personal: {
        Args: { p_accion: string; p_datos: Json }
        Returns: Json
      }
      gestionar_flujos_caja_efectivo: {
        Args: { p_accion: string; p_datos: Json }
        Returns: Json
      }
      gestionar_horarios: {
        Args: { p_accion: string; p_datos: Json }
        Returns: Json
      }
      gestionar_ingredientes: {
        Args: { p_accion: string; p_datos: Json }
        Returns: Json
      }
      gestionar_proveedores: {
        Args: { p_accion: string; p_datos: Json }
        Returns: Json
      }
      gestionar_recetas: {
        Args: { p_accion: string; p_datos: Json }
        Returns: Json
      }
      gestionar_reservas: {
        Args: { p_accion: string; p_datos: Json }
        Returns: Json
      }
      get_cash_closings_summary: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: Json
      }
      get_closing_sales_breakdown: { Args: { p_date: string }; Returns: Json }
      get_consumption_modal_recipes: {
        Args: never
        Returns: {
          category: string
          id: string
          name: string
          photo_url: string
          sort_order: number
          usage_count: number
        }[]
      }
      get_daily_labor_cost: { Args: { p_target_date: string }; Returns: number }
      get_daily_sales_chart: {
        Args: { p_days?: number }
        Returns: {
          fecha: string
          total: number
        }[]
      }
      get_daily_sales_proration_weights_by_user: {
        Args: { p_date: string }
        Returns: {
          user_id: string
          weight: number
        }[]
      }
      get_daily_sales_stats: { Args: { target_date?: string }; Returns: Json }
      get_employee_role: { Args: { user_id: string }; Returns: string }
      get_financial_statement: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: Json
      }
      get_hourly_sales: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          fecha: string
          hora: number
          total: number
        }[]
      }
      get_hourly_sales_vs_labor: {
        Args: { p_date_from: string; p_date_to: string }
        Returns: {
          avg_ticket: number
          hour: number
          labor_cost: number
          margin: number
          ticket_count: number
          total_revenue: number
        }[]
      }
      get_iso_week_start: { Args: { d: string }; Returns: string }
      get_labor_cost_day_detail: { Args: { p_date: string }; Returns: Json }
      get_labor_cost_month_summary: {
        Args: { p_month: number; p_user_id?: string; p_year: number }
        Returns: Json
      }
      get_manager_ledger_balance: { Args: never; Returns: number }
      get_monthly_timesheet: {
        Args: { p_month: number; p_user_id: string; p_year: number }
        Returns: Json
      }
      get_my_employee_id: { Args: never; Returns: string }
      get_operational_box_status: {
        Args: never
        Returns: {
          box_id: string
          box_name: string
          difference: number
          physical_balance: number
          theoretical_balance: number
        }[]
      }
      get_period_card_payments: {
        Args: { p_end: string; p_start: string }
        Returns: number
      }
      get_product_margin_ranking: {
        Args: { p_date_from?: string; p_date_to?: string; p_limit?: number }
        Returns: {
          avg_sale_price: number
          margin_per_unit: number
          product_name: string
          recipe_cost: number
          recipe_id: string
          total_margin_contribution: number
          total_units_sold: number
        }[]
      }
      get_product_sales_ranking: {
        Args: {
          p_end_date: string
          p_start_date: string
          p_start_time?: string | null
          p_end_time?: string | null
        }
        Returns: {
          cantidad_total: number
          nombre_articulo: string
          precio_medio: number
          total_ingresos: number
        }[]
      }
      get_recipe_cost: {
        Args: { p_recipe_id: string; p_use_half_ration?: boolean }
        Returns: Json
      }
      get_staff_consumption_day_detail: {
        Args: { p_date: string; p_user_id?: string }
        Returns: Json
      }
      get_staff_consumption_summary: {
        Args: { p_end_date: string; p_start_date: string; p_user_id?: string }
        Returns: Json
      }
      get_team_client_install_status: {
        Args: never
        Returns: {
          email: string
          full_name: string
          has_push: boolean
          last_display_mode: string
          last_display_mode_at: string
          role: string
          user_id: string
        }[]
      }
      get_theoretical_balance: {
        Args: { target_date: string }
        Returns: number
      }
      get_ticket_lines: {
        Args: { p_numero_documento: string }
        Returns: {
          articulo_nombre: string
          cantidad: number
          importe_total: number
          precio_unidad: number
        }[]
      }
      get_ticket_sales_summary: {
        Args: {
          p_end_date: string
          p_end_time?: string
          p_start_date: string
          p_start_time?: string
        }
        Returns: Json
      }
      get_tickets_marbella_page: {
        Args: {
          p_end_date: string
          p_end_time?: string
          p_limit?: number
          p_offset?: number
          p_start_date: string
          p_start_time?: string
        }
        Returns: {
          fecha: string
          hora_cierre: string
          mesa: number
          numero_documento: string
          total_documento: number
        }[]
      }
      get_tip_pool_preview: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: Json
      }
      get_treasury_period_summary: {
        Args: { p_box_id?: string; p_end_date?: string; p_start_date?: string }
        Returns: {
          expense: number
          income: number
        }[]
      }
      get_weekday_ticket_analysis: {
        Args: { p_date_from: string; p_date_to: string }
        Returns: {
          avg_revenue: number
          avg_revenue_with_event: number
          avg_revenue_without_event: number
          avg_ticket_value: number
          avg_tickets: number
          days_with_events: number
          weekday: number
          weekday_name: string
        }[]
      }
      get_weekly_worker_stats:
        | {
            Args: {
              p_end_date: string
              p_start_date: string
              p_user_id?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_end_date: string
              p_only_completed_weeks?: boolean
              p_start_date: string
              p_user_id?: string
            }
            Returns: Json
          }
      get_worker_weekly_log_grid: {
        Args: {
          p_contracted_hours?: number
          p_start_date: string
          p_user_id: string
        }
        Returns: Json
      }
      get_working_date: { Args: { ts: string }; Returns: string }
      ingredient_prices_are_equal: {
        Args: { a: number; b: number }
        Returns: boolean
      }
      invoice_line_price_to_purchase_unit: {
        Args: {
          p_fallback_factor: number
          p_ingredient_purchase_unit: string
          p_mapping_content_qty: number
          p_mapping_content_unit: string
          p_unit_price: number
        }
        Returns: number
      }
      is_drink_consumption_recipe: {
        Args: { p_category: string; p_name: string }
        Returns: boolean
      }
      is_hector_consumption_order_editor: { Args: never; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      is_manager_or_admin: { Args: never; Returns: boolean }
      is_usage_analyst: { Args: { p_user_id?: string }; Returns: boolean }
      kds_ingest_event: {
        Args: {
          p_articulo_id: number
          p_event_type: string
          p_id_ticket: string
          p_mesa: string
          p_notas?: string
          p_producto_nombre: string
          p_qty?: number
          p_source_event_id: string
        }
        Returns: string
      }
      madrid_utc_offset_hours: { Args: { ts?: string }; Returns: number }
      manager_ledger_business_ts: {
        Args: { p_entry_date: string }
        Returns: string
      }
      manager_ledger_insert_entry: {
        Args: {
          p_amount: number
          p_concept: string
          p_entry_date: string
          p_movement_type: string
        }
        Returns: string
      }
      manager_ledger_update_entry: {
        Args: {
          p_amount: number
          p_concept: string
          p_entry_date: string
          p_id: string
          p_movement_type: string
        }
        Returns: undefined
      }
      normalize_kds_name: { Args: { p: string }; Returns: string }
      normalize_pricing_unit: { Args: { p_unit: string }; Returns: string }
      pack_price_for_target_current: {
        Args: {
          p_pack_unit_size_qty: number
          p_pack_unit_size_unit: string
          p_pack_units: number
          p_purchase_unit: string
          p_target_current: number
        }
        Returns: number
      }
      process_cash_exchange: {
        Args: {
          p_dest_box_id: string
          p_in_breakdown: Json
          p_notes?: string
          p_origin_box_id: string
          p_out_breakdown: Json
          p_user_id: string
        }
        Returns: undefined
      }
      process_staff_consumption: {
        Args: { p_employee_id: string; p_items: Json }
        Returns: Json
      }
      process_ticket_stock_deduction: {
        Args: { p_numero_documento: string }
        Returns: undefined
      }
      recipe_qty_to_base_unit: {
        Args: {
          p_base_unit: string
          p_mode?: string
          p_pack_qty?: number
          p_pack_unit?: string
          p_qty: number
          p_recipe_unit: string
        }
        Returns: number
      }
      recipe_qty_to_purchase_unit_for_cost: {
        Args: {
          p_mode?: string
          p_pack_qty?: number
          p_pack_unit?: string
          p_purchase_unit: string
          p_qty: number
          p_recipe_unit: string
        }
        Returns: number
      }
      revert_ticket_stock_deduction: {
        Args: { p_numero_documento: string }
        Returns: undefined
      }
      rpc_recalculate_all_balances: { Args: never; Returns: Json }
      rpc_recalculate_all_balances_from_week: {
        Args: { p_week_start: string }
        Returns: Json
      }
      rpc_recalculate_all_users_from_week: {
        Args: { p_week_start: string }
        Returns: Json
      }
      rpc_recalculate_user_balances_from_week: {
        Args: { p_user_id: string; p_week_start: string }
        Returns: Json
      }
      save_staff_consumption_recipe_display_order: {
        Args: { p_ordered_recipe_ids: string[] }
        Returns: undefined
      }
      set_weekly_target: {
        Args: {
          p_employee_id: string
          p_new_target: number
          p_week_start: string
        }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      staff_consumption_movement_amount_eur: {
        Args: {
          p_current_price: number
          p_movement_qty: number
          p_movement_unit: string
          p_purchase_unit: string
        }
        Returns: number
      }
      staff_consumption_qty_to_purchase_unit:
        | {
            Args: {
              p_purchase_unit: string
              p_qty: number
              p_recipe_unit: string
            }
            Returns: number
          }
        | {
            Args: {
              p_ingredient_name?: string
              p_pack_unit_size_qty?: number
              p_pack_unit_size_unit?: string
              p_purchase_unit: string
              p_qty: number
              p_recipe_name?: string
              p_recipe_unit: string
              p_supplier_pricing_mode?: string
            }
            Returns: number
          }
      staff_consumption_recipe_serving_cost: {
        Args: { p_recipe_id: string }
        Returns: number
      }
      staff_consumption_recipe_usage_counts: {
        Args: never
        Returns: {
          recipe_id: string
          usage_count: number
        }[]
      }
      sync_purchase_invoice_status: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      ticket_effective_reception_ts: {
        Args: { p_fecha: string; p_fecha_real: string; p_hora_cierre: string }
        Returns: string
      }
      update_own_avatar_url: {
        Args: { new_avatar_url: string }
        Returns: string
      }
      upsert_tip_override: {
        Args: {
          p_is_sanctioned?: boolean
          p_notes?: string
          p_override_amount?: number
          p_override_hours?: number
          p_pool_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      upsert_tip_pool: {
        Args: {
          p_cash_breakdown?: Json
          p_cash_total: number
          p_notes?: string
          p_pool_type: string
        }
        Returns: {
          cash_breakdown: Json
          cash_total: number
          created_at: string
          created_by: string
          id: string
          notes: string | null
          pool_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tip_pools"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validate_staff_consumption: {
        Args: { p_items: Json }
        Returns: {
          error_message: string
          recipe_id: string
          recipe_name: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "staff"
      app_usage_event_type: "login" | "session" | "page_view" | "action"
      kds_item_status: "pendiente" | "terminado" | "cancelado"
      kds_order_status: "activa" | "completada"
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
      app_role: ["admin", "manager", "staff"],
      app_usage_event_type: ["login", "session", "page_view", "action"],
      kds_item_status: ["pendiente", "terminado", "cancelado"],
      kds_order_status: ["activa", "completada"],
    },
  },
} as const
