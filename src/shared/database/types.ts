export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Organization = {
  id: string; name: string; slug: string; default_currency: string;
  service_fee_bps: number; fee_payer: "buyer" | "producer" | "mixed";
  platform_fee_bps: number;
};
export type Venue = {
  id: string; organization_id: string; name: string; address: string; city: string;
  province: string; capacity: number; timezone: string;
};
export type Event = {
  id: string; organization_id: string; venue_id: string; name: string; slug: string;
  description: string; cover_image_url: string | null; starts_at: string;
  doors_open_at: string | null; ends_at: string | null;
  status: "draft" | "published" | "sold_out" | "finished" | "cancelled";
  capacity: number; require_document: boolean; currency: string; published_at: string | null;
};
export type TicketType = {
  id: string; organization_id: string; event_id: string; sale_phase_id: string | null; name: string; description: string;
  price_amount: number; currency: string; quantity: number; max_per_order: number;
  sales_start: string | null; sales_end: string | null; active: boolean; publicly_available: boolean; sort_order: number;
};

export type OrderStatus = "pending" | "paid" | "expired" | "cancelled" | "refunded";
export type PaymentAccountStatus = "pending" | "connected" | "expired" | "disconnected" | "error";
export type PaymentStatus =
  | "pending"
  | "processing"
  | "approved"
  | "rejected"
  | "cancelled"
  | "refunded"
  | "partially_refunded"
  | "charged_back"
  | "approved_inventory_conflict"
  | "approved_duplicate_charge"
  | "error";

export type Customer = {
  id: string;
  organization_id: string;
  auth_user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  document: string | null;
  created_at: string;
};

export type Order = {
  id: string;
  public_id: string;
  organization_id: string;
  event_id: string;
  customer_id: string;
  channel: "ticket_web" | "admin";
  status: OrderStatus;
  subtotal_amount: number;
  service_fee_amount: number;
  total_amount: number;
  currency: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  organization_id: string;
  order_id: string;
  ticket_type_id: string;
  item_name: string;
  quantity: number;
  unit_price_amount: number;
  line_total_amount: number;
  currency: string;
  created_at: string;
};

export type PaymentAccount = {
  id: string;
  organization_id: string;
  provider: "mercado_pago";
  provider_account_id: string | null;
  provider_public_key: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_scope: string | null;
  live_mode: boolean;
  expires_at: string | null;
  status: PaymentAccountStatus;
  connected_at: string | null;
  disconnected_at: string | null;
  last_refreshed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Payment = {
  id: string;
  public_id: string;
  organization_id: string;
  order_id: string;
  payment_account_id: string;
  provider: "mercado_pago";
  provider_preference_id: string | null;
  provider_payment_id: string | null;
  idempotency_key: string;
  attempt_number: number;
  status: PaymentStatus;
  currency: string;
  gross_amount: number;
  service_fee_amount: number;
  platform_fee_amount: number;
  processor_fee_amount: number;
  seller_net_amount: number | null;
  provider_status: string | null;
  provider_status_detail: string | null;
  checkout_url: string | null;
  sandbox_checkout_url: string | null;
  requires_action: boolean;
  exception_code: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  refunded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WebhookEvent = {
  id: string;
  organization_id: string | null;
  payment_id: string | null;
  provider: "mercado_pago";
  provider_event_id: string;
  provider_resource_id: string | null;
  event_type: string;
  payload: Json;
  status: "received" | "processing" | "processed" | "failed" | "duplicate";
  processing_attempts: number;
  error: string | null;
  received_at: string;
  processed_at: string | null;
  updated_at: string;
};

export type TicketStatus = "valid" | "cancelled" | "refunded";
export type TicketDeliveryStatus = "pending" | "processing" | "sent" | "failed";

export type Ticket = {
  id: string;
  organization_id: string;
  event_id: string;
  order_id: string;
  order_item_id: string;
  ticket_type_id: string;
  customer_id: string;
  unit_index: number;
  status: TicketStatus;
  holder_first_name: string;
  holder_last_name: string;
  holder_document: string | null;
  max_entries: number;
  used_entries: number;
  valid_from: string;
  valid_until: string;
  sector: string | null;
  short_code: string;
  qr_token_hash: string;
  qr_token_encrypted: string;
  issued_at: string;
  cancelled_at: string | null;
  refunded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TicketDelivery = {
  id: string;
  organization_id: string;
  event_id: string;
  order_id: string;
  kind: "tickets";
  channel: "email";
  destination_hash: string;
  status: TicketDeliveryStatus;
  attempts: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

// Only the subset currently consumed by the application is declared here.
export interface Database {
  public: {
    Tables: {
      organizations: { Row: Organization; Insert: Partial<Organization> & Pick<Organization, "name" | "slug">; Update: Partial<Organization>; Relationships: [] };
      organization_members: { Row: { organization_id: string; user_id: string; role: "owner" | "admin" }; Insert: { organization_id: string; user_id: string; role: "owner" | "admin" }; Update: { role?: "owner" | "admin" }; Relationships: [] };
      venues: { Row: Venue; Insert: Omit<Venue, "id"> & { id?: string }; Update: Partial<Venue>; Relationships: [] };
      events: { Row: Event; Insert: Omit<Event, "id" | "published_at"> & { id?: string; published_at?: string | null; created_by: string }; Update: Partial<Event>; Relationships: [] };
      sale_phases: { Row: { id: string; organization_id: string; event_id: string; name: string; sort_order: number; activate_next_when_sold_out: boolean }; Insert: { id?: string; organization_id: string; event_id: string; name: string; sort_order: number; activate_next_when_sold_out?: boolean }; Update: { name?: string; sort_order?: number; activate_next_when_sold_out?: boolean }; Relationships: [] };
      ticket_types: { Row: TicketType; Insert: Omit<TicketType, "id" | "publicly_available"> & { id?: string; publicly_available?: boolean }; Update: Partial<TicketType>; Relationships: [] };
      ticket_holds: { Row: { id: string; organization_id: string; event_id: string; ticket_type_id: string; order_id: string; quantity: number; status: "active" | "consumed" | "expired" | "cancelled"; expires_at: string; created_at: string }; Insert: never; Update: never; Relationships: [] };
      customers: { Row: Customer; Insert: Omit<Customer, "id" | "created_at"> & { id?: string; created_at?: string }; Update: Partial<Customer>; Relationships: [] };
      orders: { Row: Order; Insert: never; Update: never; Relationships: [] };
      order_items: { Row: OrderItem; Insert: never; Update: never; Relationships: [] };
      payment_accounts: { Row: PaymentAccount; Insert: Omit<PaymentAccount, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string }; Update: Partial<PaymentAccount>; Relationships: [] };
      payments: { Row: Payment; Insert: never; Update: never; Relationships: [] };
      webhook_events: { Row: WebhookEvent; Insert: Omit<WebhookEvent, "id" | "received_at" | "updated_at"> & { id?: string; received_at?: string; updated_at?: string }; Update: Partial<WebhookEvent>; Relationships: [] };
      tickets: { Row: Ticket; Insert: never; Update: never; Relationships: [] };
      ticket_deliveries: { Row: TicketDelivery; Insert: never; Update: never; Relationships: [] };
      buyer_access_tokens: { Row: { id: string; token_hash: string; email_hash: string; expires_at: string; exchanged_at: string | null; revoked_at: string | null; created_at: string }; Insert: never; Update: never; Relationships: [] };
      buyer_access_token_customers: { Row: { access_token_id: string; customer_id: string }; Insert: never; Update: never; Relationships: [] };
      buyer_sessions: { Row: { id: string; session_hash: string; expires_at: string; last_used_at: string; revoked_at: string | null; created_at: string }; Insert: never; Update: never; Relationships: [] };
      buyer_session_customers: { Row: { buyer_session_id: string; customer_id: string }; Insert: never; Update: never; Relationships: [] };
      audit_logs: { Row: { id: number; organization_id: string; actor_user_id: string | null; action: string; entity_type: string; entity_id: string | null; before_data: Json | null; after_data: Json | null; created_at: string }; Insert: { organization_id: string; actor_user_id?: string | null; action: string; entity_type: string; entity_id?: string | null; before_data?: Json | null; after_data?: Json | null; created_at?: string }; Update: never; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      create_organization: { Args: { org_name: string; org_slug: string }; Returns: string };
      publish_event: { Args: { target_event: string }; Returns: undefined };
      create_guest_checkout: { Args: { target_event: string; buyer_first_name: string; buyer_last_name: string; buyer_email: string; buyer_phone: string; buyer_document: string; selections: Json }; Returns: { order_public_id: string; expires_at: string }[] };
      get_public_order: { Args: { target_public_id: string }; Returns: { public_id: string; event_name: string; event_slug: string; event_cover_url: string | null; status: OrderStatus; subtotal_amount: number; service_fee_amount: number; total_amount: number; currency: string; expires_at: string; items: Json; payment_public_id: string | null; payment_status: PaymentStatus | null; payment_requires_action: boolean; payment_updated_at: string | null; payment_account_connected: boolean }[] };
      get_public_ticket_types: { Args: { target_event: string }; Returns: (Omit<TicketType, "publicly_available"> & { available_quantity: number; sale_open: boolean })[] };
      get_public_events_discovery: { Args: Record<PropertyKey, never>; Returns: { id: string; slug: string; name: string; description: string; cover_image_url: string | null; starts_at: string; currency: string; venue_name: string; venue_address: string; city: string; province: string; timezone: string; from_price_amount: number | null; has_availability: boolean }[] };
      get_payment_account_status: { Args: { target_organization: string }; Returns: { provider: string; status: PaymentAccountStatus; connected_at: string | null; disconnected_at: string | null; expires_at: string | null; live_mode: boolean }[] };
      disconnect_payment_account: { Args: { target_organization: string }; Returns: undefined };
      prepare_payment_attempt: { Args: { target_order_public_id: string }; Returns: { payment_id: string; payment_public_id: string; payment_account_id: string; reused: boolean }[] };
      set_payment_checkout: { Args: { target_payment_public_id: string; target_preference_id: string; target_checkout_url: string; target_sandbox_checkout_url: string | null }; Returns: undefined };
      fail_payment_checkout: { Args: { target_payment_public_id: string; target_error_code: string }; Returns: undefined };
      process_payment_update: { Args: { target_payment_public_id: string; target_provider_payment_id: string; target_status: PaymentStatus; target_provider_status: string; target_provider_status_detail: string; target_gross_amount: number; target_currency: string; target_processor_fee_amount: number; target_seller_net_amount: number | null; target_approved_at: string | null }; Returns: string };
      get_dashboard_sales_metrics: { Args: { target_organization: string }; Returns: { confirmed_orders: number; confirmed_tickets: number; pending_reservations: number }[] };
      issue_tickets_for_paid_order: { Args: { target_order_id: string; credentials: Json }; Returns: Json };
      claim_ticket_delivery: { Args: { target_order_id: string; target_destination_hash: string; force_delivery?: boolean }; Returns: { delivery_id: string; should_send: boolean }[] };
      complete_ticket_delivery: { Args: { target_delivery_id: string; succeeded: boolean; error_message?: string | null }; Returns: undefined };
      create_buyer_access_token: { Args: { target_email: string; target_token_hash: string; target_email_hash: string; target_expires_at: string }; Returns: string | null };
      exchange_buyer_access_token: { Args: { target_token_hash: string; target_session_hash: string; target_session_expires_at: string }; Returns: boolean };
      get_buyer_session_customers: { Args: { target_session_hash: string }; Returns: { customer_id: string }[] };
      revoke_buyer_session: { Args: { target_session_hash: string }; Returns: undefined };
      cancel_ticket: { Args: { target_ticket: string }; Returns: undefined };
      get_event_ticket_metrics: { Args: { target_event: string }; Returns: { tickets_issued: number; paid_orders: number; delivery_failures: number }[] };
      get_event_ticket_sales: { Args: { target_event: string }; Returns: { order_id: string; order_public_id: string; buyer_name: string; buyer_email: string; order_status: OrderStatus; total_amount: number; currency: string; ticket_count: number; ticket_names: string; delivery_status: TicketDeliveryStatus | null; created_at: string }[] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
