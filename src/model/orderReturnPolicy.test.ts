import { describe, expect, it } from "vitest";
import Order from "./order.model";

describe("Order return policy schema", () => {
  it("does not disguise a legacy order as a zero-day snapshot", () => {
    const order = Order.hydrate({
      _id: "507f1f77bcf86cd799439011",
      products: [
        {
          product: "507f1f77bcf86cd799439012",
          quantity: 1,
          price: 100_000,
        },
      ],
    });

    expect(order.returnWindowDaysSnapshot).toBeUndefined();
    expect(order.products[0]?.returnWindowDays).toBeUndefined();
  });
});
