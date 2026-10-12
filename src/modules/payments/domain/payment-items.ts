export type OrderLineForPayment = {
  id: string; ticket_type_id: string | null; event_table_id: string | null; item_name: string; quantity: number;
  unit_price_amount: number; line_total_amount: number;
};

/**
 * Ítems de la preferencia de pago a partir de las líneas de la orden. La suma de unitAmount × quantity tiene que dar exactamente
 * el subtotal de la orden (ya con descuento): sin descuento sale igual que siempre (precio unitario × cantidad); con descuento se
 * cobra el total de la línea (descuento incluido). Las líneas que quedan en $0 no se envían (Mercado Pago no admite ítems en $0).
 */
export function buildPaymentItems(lines: OrderLineForPayment[], eventName: string) {
  return lines.flatMap((line) => {
    const net = line.line_total_amount;
    if (net <= 0) return [];
    const id = line.ticket_type_id ?? line.event_table_id ?? line.id;
    if (net === line.unit_price_amount * line.quantity) return [{ id, name: `${eventName} · ${line.item_name}`, quantity: line.quantity, unitAmount: line.unit_price_amount }];
    if (net % line.quantity === 0) return [{ id, name: `${eventName} · ${line.item_name} (con descuento)`, quantity: line.quantity, unitAmount: net / line.quantity }];
    return [{ id, name: `${eventName} · ${line.quantity} × ${line.item_name} (con descuento)`, quantity: 1, unitAmount: net }];
  });
}
