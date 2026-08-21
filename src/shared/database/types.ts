export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Organization = {
  id: string; name: string; slug: string; default_currency: string;
  service_fee_bps: number; fee_payer: "buyer" | "producer" | "mixed";
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
      orders: { Row: { id: string; public_id: string; organization_id: string; event_id: string; status: "pending" | "expired" | "cancelled"; subtotal_amount: number; service_fee_amount: number; total_amount: number; currency: string; expires_at: string }; Insert: never; Update: never; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      create_organization: { Args: { org_name: string; org_slug: string }; Returns: string };
      publish_event: { Args: { target_event: string }; Returns: undefined };
      create_guest_checkout: { Args: { target_event: string; buyer_first_name: string; buyer_last_name: string; buyer_email: string; buyer_phone: string; buyer_document: string; selections: Json }; Returns: { order_public_id: string; expires_at: string }[] };
      get_public_order: { Args: { target_public_id: string }; Returns: { public_id: string; event_name: string; event_slug: string; event_cover_url: string | null; status: "pending" | "expired" | "cancelled"; subtotal_amount: number; service_fee_amount: number; total_amount: number; currency: string; expires_at: string; items: Json }[] };
      get_public_ticket_types: { Args: { target_event: string }; Returns: (Omit<TicketType, "publicly_available"> & { available_quantity: number; sale_open: boolean })[] };
      get_public_events_discovery: { Args: Record<PropertyKey, never>; Returns: { id: string; slug: string; name: string; description: string; cover_image_url: string | null; starts_at: string; currency: string; venue_name: string; venue_address: string; city: string; province: string; timezone: string; from_price_amount: number | null; has_availability: boolean }[] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
