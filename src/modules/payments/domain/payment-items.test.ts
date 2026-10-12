import { describe, expect, it } from "vitest";
import { buildPaymentItems, type OrderLineForPayment } from "./payment-items";

const line = (over: Partial<OrderLineForPayment>): OrderLineForPayment => ({ id: "i1", ticket_type_id: "t1", event_table_id: null, item_name: "General", quantity: 2, unit_price_amount: 1_000_000, line_total_amount: 2_000_000, ...over });
const total = (items: Array<{ quantity: number; unitAmount: number }>) => items.reduce((sum, item) => sum + item.quantity * item.unitAmount, 0);

describe("buildPaymentItems", () => {
  it("sin descuento sale igual que siempre", () => {
    expect(buildPaymentItems([line({})], "Noche 2000")).toEqual([{ id: "t1", name: "Noche 2000 · General", quantity: 2, unitAmount: 1_000_000 }]);
  });
  it("con descuento divisible mantiene la cantidad y baja el precio unitario", () => {
    const items = buildPaymentItems([line({ line_total_amount: 1_600_000 })], "Noche 2000");
    expect(items).toMatchObject([{ quantity: 2, unitAmount: 800_000 }]);
    expect(total(items)).toBe(1_600_000);
  });
  it("con descuento no divisible cobra el total de la línea sin perder centavos", () => {
    const items = buildPaymentItems([line({ quantity: 3, line_total_amount: 2_000_001 })], "Noche 2000");
    expect(items).toHaveLength(1);
    expect(total(items)).toBe(2_000_001);
  });
  it("las líneas en $0 no se envían y la suma coincide con el subtotal", () => {
    const items = buildPaymentItems([line({ line_total_amount: 0 }), line({ id: "i2", ticket_type_id: "t2", item_name: "VIP", quantity: 1, unit_price_amount: 2_500_000, line_total_amount: 2_500_000 })], "Noche 2000");
    expect(items).toHaveLength(1);
    expect(total(items)).toBe(2_500_000);
  });
  it("las mesas usan su propio id", () => {
    expect(buildPaymentItems([line({ ticket_type_id: null, event_table_id: "mesa1", quantity: 1, line_total_amount: 1_000_000 })], "X")[0]?.id).toBe("mesa1");
  });
});
