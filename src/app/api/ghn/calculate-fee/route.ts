import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import {
  calculateShippingFee,
  GHNError,
  pickServiceId,
} from "@/lib/ghn";
import Product from "@/model/product.model";
import User from "@/model/user.model";
import { NextRequest, NextResponse } from "next/server";

// Body: { addressId, items: [{ productId, quantity }] }
// Groups items by vendor, computes a GHN fee per vendor, returns the sum.
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { addressId, items } = await req.json();
    if (!addressId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { message: "addressId and items are required" },
        { status: 400 },
      );
    }

    const user = await User.findOne({ email: session.user.email });
    const address = user?.addresses?.find(
      (a: any) => a._id.toString() === addressId.toString(),
    );
    if (!address) {
      return NextResponse.json(
        { message: "Địa chỉ giao hàng không tồn tại" },
        { status: 404 },
      );
    }

    // Load products and group by vendor.
    const productIds = items.map((i: any) => i.productId);
    const products = await Product.find({ _id: { $in: productIds } }).populate(
      "vendor",
      "shopAddressDetail shopName",
    );

    const byVendor = new Map<
      string,
      {
        vendor: any;
        weight: number;
        insurance: number;
        maxDim: number[];
        /** true nếu ít nhất 1 sản phẩm của vendor này KHÔNG miễn phí ship */
        hasPaidDelivery: boolean;
      }
    >();

    for (const item of items) {
      const product = products.find(
        (p: any) => p._id.toString() === item.productId.toString(),
      );
      if (!product) continue;
      const vendor = product.vendor;
      const vendorId = vendor._id.toString();

      if (!byVendor.has(vendorId)) {
        byVendor.set(vendorId, {
          vendor,
          weight: 0,
          insurance: 0,
          maxDim: [0, 0, 0],
          hasPaidDelivery: false,
        });
      }
      const g = byVendor.get(vendorId)!;
      g.weight += (product.weight ?? 500) * item.quantity;
      g.insurance += product.price * item.quantity;
      g.maxDim = [
        Math.max(g.maxDim[0], product.length ?? 20),
        Math.max(g.maxDim[1], product.width ?? 15),
        Math.max(g.maxDim[2], product.height ?? 10),
      ];
      // Nếu sản phẩm không freeDelivery → vendor này có phí ship thật
      if (!product.freeDelivery) g.hasPaidDelivery = true;
    }

    const feesByVendor: {
      vendorId: string;
      fee: number;
      serviceId: number;
      isFreeDelivery: boolean;
    }[] = [];

    for (const [vendorId, g] of byVendor) {
      // ── Miễn phí ship: tất cả sản phẩm của vendor này đều freeDelivery ──
      if (!g.hasPaidDelivery) {
        feesByVendor.push({ vendorId, fee: 0, serviceId: 0, isFreeDelivery: true });
        continue;
      }

      // ── Tính phí GHN bình thường ──
      const shop = g.vendor.shopAddressDetail;
      if (!shop?.districtId || !shop?.wardCode) {
        return NextResponse.json(
          {
            message: `Người bán "${g.vendor.shopName ?? ""}" chưa cấu hình địa chỉ kho GHN`,
          },
          { status: 400 },
        );
      }

      const serviceId = await pickServiceId(
        shop.districtId,
        address.districtId,
      );
      const fee = await calculateShippingFee({
        serviceId,
        fromDistrictId: shop.districtId,
        fromWardCode: shop.wardCode,
        toDistrictId: address.districtId,
        toWardCode: address.wardCode,
        weight: g.weight,
        length: g.maxDim[0],
        width: g.maxDim[1],
        height: g.maxDim[2],
        insuranceValue: g.insurance,
      });
      feesByVendor.push({ vendorId, fee, serviceId, isFreeDelivery: false });
    }

    const totalFee = feesByVendor.reduce((s, v) => s + v.fee, 0);
    return NextResponse.json({ feesByVendor, totalFee }, { status: 200 });
  } catch (error) {
    const msg =
      error instanceof GHNError
        ? error.message
        : `GHN calculate-fee error ${error}`;
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
