-- Phase 7 (seat maps) rewrote order_items_typed_reference and dropped the 'product' branch added in
-- phase 6, so finalize_pos_sale (bar/merch sales) could never insert its items. Restore it.
alter table public.order_items drop constraint order_items_typed_reference;
alter table public.order_items add constraint order_items_typed_reference check (
  (item_type = 'ticket' and ticket_type_id is not null and event_table_id is null and event_seat_id is null
    and product_id is null and event_product_id is null)
  or (item_type = 'table' and ticket_type_id is null and event_table_id is not null and event_seat_id is null
    and product_id is null and event_product_id is null and quantity = 1)
  or (item_type = 'seat' and ticket_type_id is null and event_table_id is null and event_seat_id is not null
    and product_id is null and event_product_id is null and quantity = 1)
  or (item_type = 'product' and ticket_type_id is null and event_table_id is null and event_seat_id is null
    and product_id is not null and event_product_id is not null)
);
