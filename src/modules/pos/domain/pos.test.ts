import { describe, expect, it } from "vitest";
import { addCartItem, calculateCartTotal, calculateCashSettlement, calculateExpectedCash, getPosModuleLabel, setCartQuantity, type PosCatalogItem } from "./pos";

const product: PosCatalogItem = {
  event_product_id: "11111111-1111-4111-8111-111111111111",
  product_id: "22222222-2222-4222-8222-222222222222",
  product_name: "Fernet", product_description: "", category_id: null, category_name: null,
  sku: null, barcode: null, price_amount: 1_000_000, currency: "ARS", sort_order: 0,
};

describe("POS cart", () => {
  it("adds repeated taps as quantity", () => {
    const cart = addCartItem(addCartItem([], product), product);
    expect(cart).toEqual([{ ...product, quantity: 2 }]);
    expect(calculateCartTotal(cart)).toBe(2_000_000);
  });
  it("removes a line at zero", () => expect(setCartQuantity([{ ...product, quantity: 1 }], product.event_product_id, 0)).toEqual([]));
});

describe("POS payments and cash", () => {
  it("calculates cash change in minor units", () => expect(calculateCashSettlement(2_300_000, 3_000_000)).toEqual({ received: 3_000_000, change: 700_000 }));
  it("rejects insufficient cash", () => expect(() => calculateCashSettlement(2_300_000, 2_000_000)).toThrow("INSUFFICIENT_CASH"));
  it("calculates expected close", () => expect(calculateExpectedCash({ opening: 5_000_000, cashSales: 42_000_000, cashIn: 2_000_000, cashOut: 2_500_000, cashRefunds: 0 })).toBe(46_500_000));
});

describe("profile copy", () => {
  it("uses nightlife and expo labels without changing the domain", () => {
    expect(getPosModuleLabel("nightlife")).toBe("Caja");
    expect(getPosModuleLabel("expo")).toBe("Punto de venta");
    expect(getPosModuleLabel("concert")).toBe("Ventas");
  });
});
