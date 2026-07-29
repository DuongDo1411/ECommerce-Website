import { describe, expect, it } from "vitest";

import {
  toCurrentUserDTO,
  toNavUserDTO,
  toPublicProductDTO,
} from "./dto";

describe("client DTO allowlists", () => {
  it("does not serialize security or account internals", () => {
    const source = {
      _id: "u1",
      name: "User",
      email: "u@example.test",
      role: "user",
      password: "hash",
      sessionVersion: 99,
      emailNormalized: "u@example.test",
      vendorProducts: ["secret"],
      twoFactorEnabled: true,
    };

    expect(toNavUserDTO(source)).toEqual({
      _id: "u1",
      name: "User",
      role: "user",
    });
    const serialized = JSON.stringify(toCurrentUserDTO(source, true));
    expect(serialized).not.toContain("hash");
    expect(serialized).not.toContain("sessionVersion");
    expect(serialized).not.toContain("emailNormalized");
    expect(serialized).not.toContain("vendorProducts");
  });

  it("removes vendor PII and product moderation fields from public data", () => {
    const dto = toPublicProductDTO({
      _id: "p1",
      title: "Product",
      vendor: {
        _id: "v1",
        name: "Vendor",
        shopName: "Shop",
        email: "private@example.test",
        phone: "0900000000",
        taxNumber: "SECRET",
        shopAddress: "Private address",
      },
      verificationStatus: "rejected",
      rejectedReason: "internal",
    });

    expect(dto.vendor).toEqual({
      _id: "v1",
      name: "Vendor",
      shopName: "Shop",
    });
    const serialized = JSON.stringify(dto);
    for (const value of [
      "private@example.test",
      "0900000000",
      "SECRET",
      "Private address",
      "rejected",
      "internal",
    ]) {
      expect(serialized).not.toContain(value);
    }
  });
});
