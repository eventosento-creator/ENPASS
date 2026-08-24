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
  promoter_id: string | null;
  event_promoter_id: string | null;
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

export type PromoterStatus = "active" | "inactive";
export type EventPromoterStatus = "active" | "inactive";
export type PromoterCommissionType = "fixed_per_ticket" | "percentage";
export type PromoterCommissionStatus = "pending" | "confirmed" | "cancelled" | "refunded" | "paid_out";

export type Promoter = {
  id: string;
  organization_id: string;
  display_name: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  status: PromoterStatus;
  created_at: string;
  updated_at: string;
};

export type EventPromoter = {
  id: string;
  organization_id: string;
  event_id: string;
  promoter_id: string;
  public_slug: string;
  status: EventPromoterStatus;
  created_at: string;
  updated_at: string;
};

export type PromoterCommissionRule = {
  id: string;
  organization_id: string;
  event_id: string;
  event_promoter_id: string;
  ticket_type_id: string | null;
  commission_type: PromoterCommissionType;
  commission_value: number;
  currency: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type PromoterCommission = {
  id: string;
  organization_id: string;
  event_id: string;
  promoter_id: string;
  event_promoter_id: string;
  order_id: string;
  order_item_id: string;
  ticket_id: string | null;
  commission_rule_id: string | null;
  commission_type: PromoterCommissionType;
  commission_value: number;
  base_amount: number;
  quantity: number;
  commission_amount: number;
  currency: string;
  status: PromoterCommissionStatus;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  paid_out_at: string | null;
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
export type ScannerPermission = "scanner" | "supervisor";
export type CheckInResult = "valid" | "already_used" | "invalid" | "wrong_event" | "wrong_gate" | "too_early" | "too_late" | "cancelled" | "refunded" | "expired" | "device_not_authorized" | "rate_limited";
export type CheckInSource = "qr" | "manual";

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

export type AccessGate = {
  id: string;
  organization_id: string;
  event_id: string;
  name: string;
  description: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type AccessGateTicketType = {
  access_gate_id: string;
  ticket_type_id: string;
  organization_id: string;
  event_id: string;
  created_at: string;
};

export type ScannerDeviceAuthorization = {
  id: string;
  organization_id: string;
  event_id: string;
  access_gate_id: string;
  label: string;
  permission: ScannerPermission;
  pin_hash: string | null;
  code_expires_at: string;
  session_expires_at: string;
  activation_count: number;
  activated_at: string | null;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ScannerSession = {
  id: string;
  authorization_id: string;
  organization_id: string;
  event_id: string;
  access_gate_id: string;
  permission: ScannerPermission;
  session_token_hash: string;
  expires_at: string;
  last_seen_at: string;
  scan_window_started_at: string;
  scan_attempts: number;
  manual_window_started_at: string;
  manual_attempts: number;
  revoked_at: string | null;
  created_at: string;
};

export type CheckIn = {
  id: string;
  organization_id: string | null;
  event_id: string | null;
  ticket_id: string | null;
  access_gate_id: string | null;
  scanner_session_id: string | null;
  result: CheckInResult;
  source: CheckInSource;
  entry_number: number | null;
  idempotency_key: string;
  override: boolean;
  override_by_scanner_session_id: string | null;
  override_of_checkin_id: string | null;
  override_reason: "wrong_gate" | "outside_window" | "manual_code" | "supervisor_exception" | null;
  scanned_at: string;
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
      promoters: { Row: Promoter; Insert: never; Update: never; Relationships: [] };
      event_promoters: { Row: EventPromoter; Insert: never; Update: never; Relationships: [] };
      promoter_commission_rules: { Row: PromoterCommissionRule; Insert: never; Update: never; Relationships: [] };
      promoter_commissions: { Row: PromoterCommission; Insert: never; Update: never; Relationships: [] };
      promoter_attribution_sessions: { Row: { id: string; session_token_hash: string; anonymous_session_id: string; expires_at: string; last_seen_at: string; created_at: string }; Insert: never; Update: never; Relationships: [] };
      promoter_attributions: { Row: { id: string; organization_id: string; attribution_session_id: string; event_id: string; event_promoter_id: string; touched_at: string; expires_at: string }; Insert: never; Update: never; Relationships: [] };
      promoter_link_visits: { Row: { id: number; organization_id: string; event_id: string; event_promoter_id: string; anonymous_session_id: string; visited_at: string }; Insert: never; Update: never; Relationships: [] };
      promoter_access_tokens: { Row: { id: string; organization_id: string; promoter_id: string; event_promoter_id: string; token_hash: string; expires_at: string; exchanged_at: string | null; revoked_at: string | null; created_at: string }; Insert: never; Update: never; Relationships: [] };
      promoter_sessions: { Row: { id: string; organization_id: string; promoter_id: string; session_hash: string; expires_at: string; last_used_at: string; revoked_at: string | null; created_at: string }; Insert: never; Update: never; Relationships: [] };
      payment_accounts: { Row: PaymentAccount; Insert: Omit<PaymentAccount, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string }; Update: Partial<PaymentAccount>; Relationships: [] };
      payments: { Row: Payment; Insert: never; Update: never; Relationships: [] };
      webhook_events: { Row: WebhookEvent; Insert: Omit<WebhookEvent, "id" | "received_at" | "updated_at"> & { id?: string; received_at?: string; updated_at?: string }; Update: Partial<WebhookEvent>; Relationships: [] };
      tickets: { Row: Ticket; Insert: never; Update: never; Relationships: [] };
      ticket_deliveries: { Row: TicketDelivery; Insert: never; Update: never; Relationships: [] };
      buyer_access_tokens: { Row: { id: string; token_hash: string; email_hash: string; expires_at: string; exchanged_at: string | null; revoked_at: string | null; created_at: string }; Insert: never; Update: never; Relationships: [] };
      buyer_access_token_customers: { Row: { access_token_id: string; customer_id: string }; Insert: never; Update: never; Relationships: [] };
      buyer_sessions: { Row: { id: string; session_hash: string; expires_at: string; last_used_at: string; revoked_at: string | null; created_at: string }; Insert: never; Update: never; Relationships: [] };
      buyer_session_customers: { Row: { buyer_session_id: string; customer_id: string }; Insert: never; Update: never; Relationships: [] };
      access_gates: { Row: AccessGate; Insert: never; Update: never; Relationships: [] };
      access_gate_ticket_types: { Row: AccessGateTicketType; Insert: never; Update: never; Relationships: [] };
      scanner_device_authorizations: { Row: ScannerDeviceAuthorization; Insert: never; Update: never; Relationships: [] };
      scanner_sessions: { Row: ScannerSession; Insert: never; Update: never; Relationships: [] };
      scanner_activation_rate_limits: { Row: { fingerprint_hash: string; window_started_at: string; failed_attempts: number; blocked_until: string | null; updated_at: string }; Insert: never; Update: never; Relationships: [] };
      checkins: { Row: CheckIn; Insert: never; Update: never; Relationships: [] };
      audit_logs: { Row: { id: number; organization_id: string; actor_user_id: string | null; action: string; entity_type: string; entity_id: string | null; before_data: Json | null; after_data: Json | null; created_at: string }; Insert: { organization_id: string; actor_user_id?: string | null; action: string; entity_type: string; entity_id?: string | null; before_data?: Json | null; after_data?: Json | null; created_at?: string }; Update: never; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      create_organization: { Args: { org_name: string; org_slug: string }; Returns: string };
      publish_event: { Args: { target_event: string }; Returns: undefined };
      create_guest_checkout: { Args: { target_event: string; buyer_first_name: string; buyer_last_name: string; buyer_email: string; buyer_phone: string; buyer_document: string; selections: Json }; Returns: { order_public_id: string; expires_at: string }[] };
      create_guest_checkout_attributed: { Args: { target_event: string; buyer_first_name: string; buyer_last_name: string; buyer_email: string; buyer_phone: string; buyer_document: string; selections: Json; target_attribution_session_hash: string | null }; Returns: { order_public_id: string; expires_at: string }[] };
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
      create_access_gate: { Args: { target_event: string; gate_name: string; gate_description: string; accepted_ticket_types: string[] }; Returns: string };
      update_access_gate: { Args: { target_gate: string; gate_name: string; gate_description: string; gate_active: boolean; accepted_ticket_types: string[] }; Returns: undefined };
      create_scanner_authorization: { Args: { target_event: string; target_gate: string; device_label: string; target_permission: ScannerPermission; target_pin: string; target_code_expires_at: string; target_session_expires_at: string }; Returns: string };
      revoke_scanner_authorization: { Args: { target_authorization: string }; Returns: undefined };
      activate_scanner_device: { Args: { target_pin: string; target_session_hash: string; target_fingerprint_hash: string }; Returns: { activation_status: string; scanner_session_id: string | null; event_id: string | null; event_name: string | null; gate_id: string | null; gate_name: string | null; permission: ScannerPermission | null; event_timezone: string | null; expires_at: string | null; retry_after_seconds: number }[] };
      get_scanner_session: { Args: { target_session_hash: string }; Returns: { scanner_session_id: string; event_id: string; event_name: string; gate_id: string; gate_name: string; permission: ScannerPermission; event_timezone: string; expires_at: string }[] };
      revoke_scanner_session: { Args: { target_session: string }; Returns: undefined };
      revoke_current_scanner_session: { Args: { target_session_hash: string }; Returns: undefined };
      check_in_ticket: { Args: { target_session_hash: string; target_qr_hash: string; target_idempotency_key: string }; Returns: { result: CheckInResult; checkin_id: string | null; ticket_id: string | null; holder_name: string | null; ticket_type_name: string | null; sector: string | null; short_code: string | null; used_entries: number | null; max_entries: number | null; first_used_at: string | null; first_used_gate_name: string | null; valid_from: string | null; valid_until: string | null; suggested_gate_name: string | null; scanned_at: string }[] };
      supervisor_override_checkin: { Args: { target_session_hash: string; target_checkin: string; target_reason: "wrong_gate" | "outside_window" | "supervisor_exception"; target_idempotency_key: string }; Returns: Json };
      get_supervisor_ticket_preview: { Args: { target_session_hash: string; target_short_code: string }; Returns: Json };
      supervisor_manual_checkin: { Args: { target_session_hash: string; target_short_code: string; target_idempotency_key: string }; Returns: Json };
      get_event_access_metrics: { Args: { target_event: string }; Returns: { entries_today: number; valid_scans_today: number; duplicate_scans_today: number; rejected_scans_today: number; active_devices: number }[] };
      get_event_recent_checkins: { Args: { target_event: string; result_limit?: number }; Returns: { checkin_id: string; result: CheckInResult; gate_name: string | null; device_label: string | null; ticket_type_name: string | null; holder_name: string | null; short_code: string | null; entry_number: number | null; override: boolean; source: CheckInSource; scanned_at: string }[] };
      create_event_promoter: { Args: { target_event: string; promoter_first_name: string; promoter_last_name: string; promoter_email: string; promoter_phone: string; promoter_instagram: string; target_public_slug: string; target_commission_type: PromoterCommissionType; target_commission_value: number }; Returns: { event_promoter_id: string; promoter_id: string }[] };
      update_event_promoter: { Args: { target_event_promoter: string; promoter_first_name: string; promoter_last_name: string; promoter_email: string; promoter_phone: string; promoter_instagram: string; target_public_slug: string }; Returns: undefined };
      set_event_promoter_status: { Args: { target_event_promoter: string; target_status: EventPromoterStatus }; Returns: undefined };
      upsert_promoter_commission_rule: { Args: { target_event_promoter: string; target_ticket_type: string | null; target_commission_type: PromoterCommissionType; target_commission_value: number }; Returns: string };
      create_promoter_access_token: { Args: { target_event_promoter: string; target_token_hash: string; target_expires_at: string }; Returns: string };
      exchange_promoter_access_token: { Args: { target_token_hash: string; target_session_hash: string; target_session_expires_at: string }; Returns: boolean };
      get_promoter_session: { Args: { target_session_hash: string }; Returns: { promoter_id: string; organization_id: string; display_name: string; expires_at: string }[] };
      revoke_promoter_session: { Args: { target_session_hash: string }; Returns: undefined };
      record_promoter_link_visit: { Args: { target_event_slug: string; target_promoter_slug: string; target_session_hash: string; target_anonymous_session_id: string }; Returns: { resolved_event_id: string; resolved_event_promoter_id: string; promoter_display_name: string; attribution_expires_at: string }[] };
      get_active_promoter_attribution: { Args: { target_event: string; target_session_hash: string }; Returns: { event_promoter_id: string; promoter_id: string; promoter_display_name: string; expires_at: string }[] };
      calculate_promoter_commissions_for_order: { Args: { target_order: string }; Returns: number };
      reconcile_event_promoter_commissions: { Args: { target_event: string }; Returns: number };
      reconcile_promoter_session_commissions: { Args: { target_session_hash: string }; Returns: number };
      get_event_promoter_metrics: { Args: { target_event: string }; Returns: { event_promoter_id: string; promoter_id: string; display_name: string; public_slug: string; status: EventPromoterStatus; tickets_sold: number; ticket_revenue: number; confirmed_commission: number; visits: number; paid_orders: number; currency: string }[] };
      get_event_attribution_metrics: { Args: { target_event: string }; Returns: { promoter_ticket_revenue: number; direct_ticket_revenue: number; promoter_tickets: number }[] };
      get_event_promoter_detail: { Args: { target_event_promoter: string }; Returns: { tickets_sold: number; ticket_revenue: number; confirmed_commission: number; visits: number; ticket_breakdown: Json; recent_sales: Json; currency: string }[] };
      get_promoter_dashboard: { Args: { target_session_hash: string }; Returns: { event_promoter_id: string; event_id: string; event_name: string; event_slug: string; event_starts_at: string; event_timezone: string; public_slug: string; relation_status: EventPromoterStatus; tickets_sold: number; ticket_revenue: number; confirmed_commission: number; visits: number; currency: string }[] };
      get_promoter_event_dashboard: { Args: { target_session_hash: string; target_event_promoter: string }; Returns: { event_promoter_id: string; event_name: string; event_slug: string; event_starts_at: string; event_timezone: string; public_slug: string; relation_status: EventPromoterStatus; tickets_sold: number; ticket_revenue: number; confirmed_commission: number; visits: number; ticket_breakdown: Json; recent_sales: Json; currency: string }[] };
      duplicate_event_with_options: { Args: { target_event: string; target_name: string; target_slug: string; target_starts_at: string; preserve_promoters: boolean }; Returns: string };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
