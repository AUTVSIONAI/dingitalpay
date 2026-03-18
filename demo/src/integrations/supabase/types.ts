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
      acquirer_configs: {
        Row: {
          acquirer_name: string
          active: boolean
          created_at: string
          credentials: Json
          id: string
          updated_at: string
        }
        Insert: {
          acquirer_name: string
          active?: boolean
          created_at?: string
          credentials?: Json
          id?: string
          updated_at?: string
        }
        Update: {
          acquirer_name?: string
          active?: boolean
          created_at?: string
          credentials?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      course_lessons: {
        Row: {
          created_at: string
          duration: string | null
          id: string
          locked: boolean
          module_id: string
          sort_order: number
          title: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          duration?: string | null
          id?: string
          locked?: boolean
          module_id: string
          sort_order?: number
          title: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          duration?: string | null
          id?: string
          locked?: boolean
          module_id?: string
          sort_order?: number
          title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      course_modules: {
        Row: {
          course_id: string
          created_at: string
          id: string
          sort_order: number
          title: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          sort_order?: number
          title: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          id: string
          lesson_id: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          lesson_id: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          lesson_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          preview_token: string | null
          product_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          preview_token?: string | null
          product_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          preview_token?: string | null
          product_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          body: string
          click_count: number
          created_at: string
          id: string
          name: string
          open_count: number
          recipients_count: number
          scheduled_at: string | null
          sent_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          body?: string
          click_count?: number
          created_at?: string
          id?: string
          name: string
          open_count?: number
          recipients_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Update: {
          body?: string
          click_count?: number
          created_at?: string
          id?: string
          name?: string
          open_count?: number
          recipients_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body: string
          category: string
          click_rate: string
          created_at: string
          default_body: string
          default_subject: string
          description: string
          enabled: boolean
          event_key: string
          id: string
          open_rate: string
          sent_count: number
          subject: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          category?: string
          click_rate?: string
          created_at?: string
          default_body?: string
          default_subject?: string
          description?: string
          enabled?: boolean
          event_key: string
          id?: string
          open_rate?: string
          sent_count?: number
          subject?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          click_rate?: string
          created_at?: string
          default_body?: string
          default_subject?: string
          description?: string
          enabled?: boolean
          event_key?: string
          id?: string
          open_rate?: string
          sent_count?: number
          subject?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          read: boolean
          reference_id: string | null
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          read?: boolean
          reference_id?: string | null
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          read?: boolean
          reference_id?: string | null
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          is_order_bump: boolean
          order_id: string
          product_id: string
          product_name: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          is_order_bump?: boolean
          order_id: string
          product_id: string
          product_name?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          is_order_bump?: boolean
          order_id?: string
          product_id?: string
          product_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount: number
          buyer_cpf: string | null
          buyer_email: string
          buyer_name: string
          buyer_phone: string | null
          checkout_url: string | null
          client_ip: string | null
          client_user_agent: string | null
          created_at: string
          gross_amount: number
          id: string
          meta_fbc: string | null
          meta_fbp: string | null
          method: Database["public"]["Enums"]["payment_method"]
          platform_fee: number
          product_id: string
          product_name: string
          seller_id: string
          status: Database["public"]["Enums"]["order_status"]
          transaction_id: string | null
          updated_at: string
          utm: Json | null
        }
        Insert: {
          amount?: number
          buyer_cpf?: string | null
          buyer_email: string
          buyer_name?: string
          buyer_phone?: string | null
          checkout_url?: string | null
          client_ip?: string | null
          client_user_agent?: string | null
          created_at?: string
          gross_amount?: number
          id?: string
          meta_fbc?: string | null
          meta_fbp?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          platform_fee?: number
          product_id: string
          product_name?: string
          seller_id: string
          status?: Database["public"]["Enums"]["order_status"]
          transaction_id?: string | null
          updated_at?: string
          utm?: Json | null
        }
        Update: {
          amount?: number
          buyer_cpf?: string | null
          buyer_email?: string
          buyer_name?: string
          buyer_phone?: string | null
          checkout_url?: string | null
          client_ip?: string | null
          client_user_agent?: string | null
          created_at?: string
          gross_amount?: number
          id?: string
          meta_fbc?: string | null
          meta_fbp?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          platform_fee?: number
          product_id?: string
          product_name?: string
          seller_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          transaction_id?: string | null
          updated_at?: string
          utm?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_method_acquirers: {
        Row: {
          acquirer_name: string
          created_at: string
          id: string
          method: string
          updated_at: string
        }
        Insert: {
          acquirer_name: string
          created_at?: string
          id?: string
          method: string
          updated_at?: string
        }
        Update: {
          acquirer_name?: string
          created_at?: string
          id?: string
          method?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_fee_logs: {
        Row: {
          created_at: string
          fee_amount: number
          gross_amount: number
          id: string
          method: string
          order_id: string | null
          seller_id: string
          type: string
          withdrawal_id: string | null
        }
        Insert: {
          created_at?: string
          fee_amount?: number
          gross_amount?: number
          id?: string
          method?: string
          order_id?: string | null
          seller_id: string
          type?: string
          withdrawal_id?: string | null
        }
        Update: {
          created_at?: string
          fee_amount?: number
          gross_amount?: number
          id?: string
          method?: string
          order_id?: string | null
          seller_id?: string
          type?: string
          withdrawal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_fee_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_fee_logs_withdrawal_id_fkey"
            columns: ["withdrawal_id"]
            isOneToOne: false
            referencedRelation: "withdrawals"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_fees: {
        Row: {
          created_at: string
          fee_fixed: number
          fee_percent: number
          id: string
          method: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fee_fixed?: number
          fee_percent?: number
          id?: string
          method: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fee_fixed?: number
          fee_percent?: number
          id?: string
          method?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          created_at: string
          dark_logo_url: string
          description: string
          email_verification: boolean
          favicon_url: string
          glow_mode: boolean
          id: string
          language: string
          logo_url: string
          maintenance_mode: boolean
          max_withdrawal: number
          min_withdrawal: number
          neon_mode: boolean
          palette: string
          platform_name: string
          platform_url: string
          privacy_policy: string
          registration_open: boolean
          require_terms_acceptance: boolean
          support_email: string
          terms_of_use: string
          two_factor: boolean
          updated_at: string
          white_logo_url: string
          withdrawal_fee_percent: number
          withdrawal_fee_type: string
          withdrawal_pix_enabled: boolean
          withdrawal_processing_days: number
          withdrawal_ted_enabled: boolean
        }
        Insert: {
          created_at?: string
          dark_logo_url?: string
          description?: string
          email_verification?: boolean
          favicon_url?: string
          glow_mode?: boolean
          id?: string
          language?: string
          logo_url?: string
          maintenance_mode?: boolean
          max_withdrawal?: number
          min_withdrawal?: number
          neon_mode?: boolean
          palette?: string
          platform_name?: string
          platform_url?: string
          privacy_policy?: string
          registration_open?: boolean
          require_terms_acceptance?: boolean
          support_email?: string
          terms_of_use?: string
          two_factor?: boolean
          updated_at?: string
          white_logo_url?: string
          withdrawal_fee_percent?: number
          withdrawal_fee_type?: string
          withdrawal_pix_enabled?: boolean
          withdrawal_processing_days?: number
          withdrawal_ted_enabled?: boolean
        }
        Update: {
          created_at?: string
          dark_logo_url?: string
          description?: string
          email_verification?: boolean
          favicon_url?: string
          glow_mode?: boolean
          id?: string
          language?: string
          logo_url?: string
          maintenance_mode?: boolean
          max_withdrawal?: number
          min_withdrawal?: number
          neon_mode?: boolean
          palette?: string
          platform_name?: string
          platform_url?: string
          privacy_policy?: string
          registration_open?: boolean
          require_terms_acceptance?: boolean
          support_email?: string
          terms_of_use?: string
          two_factor?: boolean
          updated_at?: string
          white_logo_url?: string
          withdrawal_fee_percent?: number
          withdrawal_fee_type?: string
          withdrawal_pix_enabled?: boolean
          withdrawal_processing_days?: number
          withdrawal_ted_enabled?: boolean
        }
        Relationships: []
      }
      platform_updates: {
        Row: {
          changes: Json
          created_at: string
          date: string
          description: string
          id: string
          title: string
          type: string
          version: string
        }
        Insert: {
          changes?: Json
          created_at?: string
          date?: string
          description?: string
          id?: string
          title: string
          type?: string
          version: string
        }
        Update: {
          changes?: Json
          created_at?: string
          date?: string
          description?: string
          id?: string
          title?: string
          type?: string
          version?: string
        }
        Relationships: []
      }
      product_checkout_config: {
        Row: {
          banner_url: string | null
          buy_button_text: string
          colors: Json
          countdown_enabled: boolean
          countdown_expired_phrase: string
          countdown_minutes: number
          countdown_phrase: string
          created_at: string
          email_confirmation: boolean
          id: string
          notification_interval: number
          notification_names: Json
          order_bump_discount: number
          order_bump_items: Json
          order_bump_product_id: string | null
          payment_methods: Json
          product_id: string
          required_fields: Json
          reviews: Json
          reviews_enabled: boolean
          social_proof_enabled: boolean
          thank_you_config: Json
          thank_you_redirect_delay: number
          updated_at: string
          whatsapp_message: string
          whatsapp_support: string | null
        }
        Insert: {
          banner_url?: string | null
          buy_button_text?: string
          colors?: Json
          countdown_enabled?: boolean
          countdown_expired_phrase?: string
          countdown_minutes?: number
          countdown_phrase?: string
          created_at?: string
          email_confirmation?: boolean
          id?: string
          notification_interval?: number
          notification_names?: Json
          order_bump_discount?: number
          order_bump_items?: Json
          order_bump_product_id?: string | null
          payment_methods?: Json
          product_id: string
          required_fields?: Json
          reviews?: Json
          reviews_enabled?: boolean
          social_proof_enabled?: boolean
          thank_you_config?: Json
          thank_you_redirect_delay?: number
          updated_at?: string
          whatsapp_message?: string
          whatsapp_support?: string | null
        }
        Update: {
          banner_url?: string | null
          buy_button_text?: string
          colors?: Json
          countdown_enabled?: boolean
          countdown_expired_phrase?: string
          countdown_minutes?: number
          countdown_phrase?: string
          created_at?: string
          email_confirmation?: boolean
          id?: string
          notification_interval?: number
          notification_names?: Json
          order_bump_discount?: number
          order_bump_items?: Json
          order_bump_product_id?: string | null
          payment_methods?: Json
          product_id?: string
          required_fields?: Json
          reviews?: Json
          reviews_enabled?: boolean
          social_proof_enabled?: boolean
          thank_you_config?: Json
          thank_you_redirect_delay?: number
          updated_at?: string
          whatsapp_message?: string
          whatsapp_support?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_checkout_config_order_bump_product_id_fkey"
            columns: ["order_bump_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_checkout_config_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          expires_at: string | null
          id: string
          product_id: string
          type: string
          usage_limit: number
          used_count: number
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          product_id: string
          type?: string
          usage_limit?: number
          used_count?: number
          value?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          product_id?: string
          type?: string
          usage_limit?: number
          used_count?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_coupons_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_delivery_config: {
        Row: {
          auto_send: boolean
          created_at: string
          delivery_method: string | null
          dimensions: string | null
          download_url: string | null
          email_body: string | null
          email_subject: string | null
          file_url: string | null
          id: string
          instructions: string | null
          processing_days: number | null
          product_id: string
          shipping_method: string | null
          tracking_enabled: boolean
          updated_at: string
          weight: string | null
        }
        Insert: {
          auto_send?: boolean
          created_at?: string
          delivery_method?: string | null
          dimensions?: string | null
          download_url?: string | null
          email_body?: string | null
          email_subject?: string | null
          file_url?: string | null
          id?: string
          instructions?: string | null
          processing_days?: number | null
          product_id: string
          shipping_method?: string | null
          tracking_enabled?: boolean
          updated_at?: string
          weight?: string | null
        }
        Update: {
          auto_send?: boolean
          created_at?: string
          delivery_method?: string | null
          dimensions?: string | null
          download_url?: string | null
          email_body?: string | null
          email_subject?: string | null
          file_url?: string | null
          id?: string
          instructions?: string | null
          processing_days?: number | null
          product_id?: string
          shipping_method?: string | null
          tracking_enabled?: boolean
          updated_at?: string
          weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_delivery_config_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          product_id: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          product_id: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          product_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "product_domains_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_offers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          price: number
          product_id: string
          slug: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          price?: number
          product_id: string
          slug?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          price?: number
          product_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_pixels: {
        Row: {
          access_token: string
          active: boolean
          created_at: string
          id: string
          pixel_id: string
          platform: string
          product_id: string
        }
        Insert: {
          access_token?: string
          active?: boolean
          created_at?: string
          id?: string
          pixel_id?: string
          platform: string
          product_id: string
        }
        Update: {
          access_token?: string
          active?: boolean
          created_at?: string
          id?: string
          pixel_id?: string
          platform?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_pixels_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_upsell_config: {
        Row: {
          created_at: string
          cta_text: string
          decline_text: string
          description: string
          downsell_cta_text: string | null
          downsell_enabled: boolean
          downsell_product_id: string | null
          downsell_special_price: number | null
          downsell_title: string | null
          enabled: boolean
          id: string
          image_url: string | null
          product_id: string
          special_price: number | null
          title: string
          updated_at: string
          upsell_product_id: string | null
        }
        Insert: {
          created_at?: string
          cta_text?: string
          decline_text?: string
          description?: string
          downsell_cta_text?: string | null
          downsell_enabled?: boolean
          downsell_product_id?: string | null
          downsell_special_price?: number | null
          downsell_title?: string | null
          enabled?: boolean
          id?: string
          image_url?: string | null
          product_id: string
          special_price?: number | null
          title?: string
          updated_at?: string
          upsell_product_id?: string | null
        }
        Update: {
          created_at?: string
          cta_text?: string
          decline_text?: string
          description?: string
          downsell_cta_text?: string | null
          downsell_enabled?: boolean
          downsell_product_id?: string | null
          downsell_special_price?: number | null
          downsell_title?: string | null
          enabled?: boolean
          id?: string
          image_url?: string | null
          product_id?: string
          special_price?: number | null
          title?: string
          updated_at?: string
          upsell_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_upsell_config_downsell_product_id_fkey"
            columns: ["downsell_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_upsell_config_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_upsell_config_upsell_product_id_fkey"
            columns: ["upsell_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          delivery_type: string | null
          id: string
          image_url: string | null
          long_description: string | null
          name: string
          price: number
          revenue: number
          sales: number
          seller_id: string
          short_description: string | null
          status: Database["public"]["Enums"]["product_status"]
          type: Database["public"]["Enums"]["product_type"]
          updated_at: string
          warranty_days: number | null
        }
        Insert: {
          created_at?: string
          delivery_type?: string | null
          id?: string
          image_url?: string | null
          long_description?: string | null
          name: string
          price?: number
          revenue?: number
          sales?: number
          seller_id: string
          short_description?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
          warranty_days?: number | null
        }
        Update: {
          created_at?: string
          delivery_type?: string | null
          id?: string
          image_url?: string | null
          long_description?: string | null
          name?: string
          price?: number
          revenue?: number
          sales?: number
          seller_id?: string
          short_description?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
          warranty_days?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          birth_date: string | null
          city: string | null
          company: string | null
          country: string | null
          cpf: string | null
          created_at: string
          email_notifications: boolean | null
          id: string
          marketing_emails: boolean | null
          name: string
          phone: string | null
          sms_notifications: boolean | null
          state: string | null
          timezone: string | null
          two_factor_enabled: boolean | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
          cpf?: string | null
          created_at?: string
          email_notifications?: boolean | null
          id?: string
          marketing_emails?: boolean | null
          name?: string
          phone?: string | null
          sms_notifications?: boolean | null
          state?: string | null
          timezone?: string | null
          two_factor_enabled?: boolean | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
          cpf?: string | null
          created_at?: string
          email_notifications?: boolean | null
          id?: string
          marketing_emails?: boolean | null
          name?: string
          phone?: string | null
          sms_notifications?: boolean | null
          state?: string | null
          timezone?: string | null
          two_factor_enabled?: boolean | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      reward_claims: {
        Row: {
          claimed_at: string
          created_at: string
          id: string
          revenue_achieved: number
          reward_id: string
          seller_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          claimed_at?: string
          created_at?: string
          id?: string
          revenue_achieved?: number
          reward_id: string
          seller_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          claimed_at?: string
          created_at?: string
          id?: string
          revenue_achieved?: number
          reward_id?: string
          seller_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_claims_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          created_at: string
          delivery_instructions: string | null
          description: string
          id: string
          image_url: string
          max_revenue: number
          min_revenue: number
          name: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_instructions?: string | null
          description?: string
          id?: string
          image_url?: string
          max_revenue?: number
          min_revenue?: number
          name: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_instructions?: string | null
          description?: string
          id?: string
          image_url?: string
          max_revenue?: number
          min_revenue?: number
          name?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      smtp_config: {
        Row: {
          bounces: string
          created_at: string
          delivery_rate: string
          emails_sent_today: number
          enabled: boolean
          encryption: string
          from_email: string
          from_name: string
          host: string
          id: string
          last_test: string
          password: string
          port: string
          updated_at: string
          username: string
        }
        Insert: {
          bounces?: string
          created_at?: string
          delivery_rate?: string
          emails_sent_today?: number
          enabled?: boolean
          encryption?: string
          from_email?: string
          from_name?: string
          host?: string
          id?: string
          last_test?: string
          password?: string
          port?: string
          updated_at?: string
          username?: string
        }
        Update: {
          bounces?: string
          created_at?: string
          delivery_rate?: string
          emails_sent_today?: number
          enabled?: boolean
          encryption?: string
          from_email?: string
          from_name?: string
          host?: string
          id?: string
          last_test?: string
          password?: string
          port?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      smtp_dns_records: {
        Row: {
          created_at: string
          id: string
          status: string
          type: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          type: string
          value?: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          type?: string
          value?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_endpoints: {
        Row: {
          active: boolean
          created_at: string
          events: Json
          id: string
          last_triggered_at: string | null
          name: string
          secret: string
          seller_id: string
          success_rate: number
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          events?: Json
          id?: string
          last_triggered_at?: string | null
          name: string
          secret?: string
          seller_id: string
          success_rate?: number
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          events?: Json
          id?: string
          last_triggered_at?: string | null
          name?: string
          secret?: string
          seller_id?: string
          success_rate?: number
          url?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          endpoint_id: string
          event: string
          id: string
          response_time: number
          status_code: number
          success: boolean
          triggered_at: string
        }
        Insert: {
          endpoint_id: string
          event: string
          id?: string
          response_time?: number
          status_code?: number
          success?: boolean
          triggered_at?: string
        }
        Update: {
          endpoint_id?: string
          event?: string
          id?: string
          response_time?: number
          status_code?: number
          success?: boolean
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          created_at: string
          delivery_rate: number
          events: Json
          id: string
          last_active_at: string | null
          last_message_at: string | null
          messages_sent_24h: number
          name: string
          phone: string
          seller_id: string
          status: string
        }
        Insert: {
          created_at?: string
          delivery_rate?: number
          events?: Json
          id?: string
          last_active_at?: string | null
          last_message_at?: string | null
          messages_sent_24h?: number
          name: string
          phone?: string
          seller_id: string
          status?: string
        }
        Update: {
          created_at?: string
          delivery_rate?: number
          events?: Json
          id?: string
          last_active_at?: string | null
          last_message_at?: string | null
          messages_sent_24h?: number
          name?: string
          phone?: string
          seller_id?: string
          status?: string
        }
        Relationships: []
      }
      withdrawal_status_history: {
        Row: {
          created_at: string
          id: string
          note: string | null
          status: Database["public"]["Enums"]["withdrawal_status"]
          withdrawal_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          status: Database["public"]["Enums"]["withdrawal_status"]
          withdrawal_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          withdrawal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_status_history_withdrawal_id_fkey"
            columns: ["withdrawal_id"]
            isOneToOne: false
            referencedRelation: "withdrawals"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawals: {
        Row: {
          amount: number
          bank_info: Json
          created_at: string
          fee_amount: number
          id: string
          method: Database["public"]["Enums"]["withdrawal_method"]
          net_amount: number
          processed_at: string | null
          rejection_reason: string | null
          requested_at: string
          seller_id: string
          status: Database["public"]["Enums"]["withdrawal_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_info?: Json
          created_at?: string
          fee_amount?: number
          id?: string
          method?: Database["public"]["Enums"]["withdrawal_method"]
          net_amount?: number
          processed_at?: string | null
          rejection_reason?: string | null
          requested_at?: string
          seller_id: string
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_info?: Json
          created_at?: string
          fee_amount?: number
          id?: string
          method?: Database["public"]["Enums"]["withdrawal_method"]
          net_amount?: number
          processed_at?: string | null
          rejection_reason?: string | null
          requested_at?: string
          seller_id?: string
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
        }
        Relationships: []
      }
      zapier_integrations: {
        Row: {
          active: boolean
          created_at: string
          events: Json
          id: string
          last_triggered_at: string | null
          name: string
          seller_id: string
          webhook_url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          events?: Json
          id?: string
          last_triggered_at?: string | null
          name: string
          seller_id: string
          webhook_url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          events?: Json
          id?: string
          last_triggered_at?: string | null
          name?: string
          seller_id?: string
          webhook_url?: string
        }
        Relationships: []
      }
      zapier_logs: {
        Row: {
          event: string
          id: string
          integration_id: string
          success: boolean
          triggered_at: string
        }
        Insert: {
          event: string
          id?: string
          integration_id: string
          success?: boolean
          triggered_at?: string
        }
        Update: {
          event?: string
          id?: string
          integration_id?: string
          success?: boolean
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "zapier_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "zapier_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_user_cascade: {
        Args: { _user_id: string }
        Returns: undefined
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "seller" | "buyer"
      order_status:
        | "pending"
        | "approved"
        | "refunded"
        | "chargeback"
        | "abandoned"
      payment_method: "pix" | "boleto" | "credit_card"
      product_status: "active" | "inactive" | "draft"
      product_type: "ebook" | "course" | "physical"
      withdrawal_method: "PIX" | "TED"
      withdrawal_status: "pending" | "in_review" | "approved" | "rejected"
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
      app_role: ["admin", "seller", "buyer"],
      order_status: [
        "pending",
        "approved",
        "refunded",
        "chargeback",
        "abandoned",
      ],
      payment_method: ["pix", "boleto", "credit_card"],
      product_status: ["active", "inactive", "draft"],
      product_type: ["ebook", "course", "physical"],
      withdrawal_method: ["PIX", "TED"],
      withdrawal_status: ["pending", "in_review", "approved", "rejected"],
    },
  },
} as const
