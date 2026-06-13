import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import Order from "@/model/order.model";
import Product from "@/model/product.model";
import User from "@/model/user.model";
import { NextResponse } from "next/server";

interface VendorStatusDoc {
  _id: unknown;
  verificationStatus?: "pending" | "approved" | "rejected";
}

interface ApprovedVendorDoc {
  _id: unknown;
  name?: string;
  email?: string;
  phone?: string;
  image?: string | null;
  shopName?: string;
  approvedAt?: Date | string | null;
  createdAt?: Date | string | null;
}

interface VendorOrderStat {
  _id: unknown;
  monthlyRevenue: number;
  deliveredOrders: number;
}

export async function GET() {
  try {
    await connectDB();

    const session = await auth();
    const adminUser = await User.findById(session?.user?.id);

    if (!adminUser || adminUser.role !== "admin") {
      return NextResponse.json(
        { message: "Only admin can view dashboard data" },
        { status: 403 },
      );
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [allVendorsRaw, pendingProducts, orderStats, approvedVendorsRaw] =
      await Promise.all([
        User.find({ role: "vendor" })
          .select("_id verificationStatus")
          .lean(),
        Product.countDocuments({ verificationStatus: "pending" }),
        Order.aggregate<VendorOrderStat>([
          {
            $match: {
              orderStatus: "delivered",
              createdAt: { $gte: startOfMonth },
            },
          },
          {
            $group: {
              _id: "$productVendor",
              monthlyRevenue: {
                $sum: { $add: ["$productsTotal", "$serviceCharge"] },
              },
              deliveredOrders: { $sum: 1 },
            },
          },
        ]),
        User.find({ role: "vendor", verificationStatus: "approved" })
          .select("_id name email phone image shopName approvedAt createdAt")
          .lean(),
      ]);

    const allVendors = allVendorsRaw as unknown as VendorStatusDoc[];
    const approvedVendors =
      approvedVendorsRaw as unknown as ApprovedVendorDoc[];

    const activeVendors = allVendors.filter(
      (vendor) => vendor.verificationStatus === "approved",
    ).length;
    const pendingVendors = allVendors.filter(
      (vendor) => vendor.verificationStatus === "pending",
    ).length;

    const productCounts = await Promise.all(
      approvedVendors.map((vendor) =>
        Product.countDocuments({
          vendor: vendor._id,
          verificationStatus: "approved",
          isActive: true,
        }),
      ),
    );

    const vendors = approvedVendors
      .map((vendor, index) => {
        const stats = orderStats.find(
          (stat) => String(stat._id) === String(vendor._id),
        );

        return {
          _id: String(vendor._id),
          name: vendor.name ?? "",
          email: vendor.email ?? "",
          phone: vendor.phone ?? "",
          image: vendor.image ?? null,
          shopName: vendor.shopName ?? "",
          approvedAt: toIsoDate(vendor.approvedAt),
          activeProducts: productCounts[index] ?? 0,
          monthlyRevenue: stats?.monthlyRevenue ?? 0,
          deliveredOrders: stats?.deliveredOrders ?? 0,
        };
      })
      .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);

    const platformMonthlyRevenue = vendors.reduce(
      (sum, vendor) => sum + vendor.monthlyRevenue,
      0,
    );

    return NextResponse.json({
      activeVendors,
      pendingVendors,
      pendingProducts,
      platformMonthlyRevenue,
      topVendor: vendors[0] ?? null,
      vendors,
    });
  } catch (error) {
    return NextResponse.json(
      { message: `Failed to fetch admin dashboard data: ${error}` },
      { status: 500 },
    );
  }
}

const toIsoDate = (date?: Date | string | null) => {
  if (!date) return null;
  const parsed = date instanceof Date ? date : new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};
