import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import Order from "@/model/order.model";
import Product from "@/model/product.model";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();

    if (!session || !session.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const vendorId = new mongoose.Types.ObjectId(session.user.id);
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "day";

    const now = new Date();

    // 1. Orders stats
    const orderStats = await Order.aggregate([
      { $match: { productVendor: vendorId } },
      {
        $group: {
          _id: "$orderStatus",
          count: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [
                { $eq: ["$orderStatus", "delivered"] },
                { $add: ["$productsTotal", "$serviceCharge"] },
                0,
              ],
            },
          },
        },
      },
    ]);

    const ordersByStatus: Record<string, number> = {
      pending: 0,
      confirmed: 0,
      shipped: 0,
      delivered: 0,
      returned: 0,
      cancelled: 0,
    };
    let totalRevenue = 0;
    let totalOrders = 0;

    for (const stat of orderStats) {
      ordersByStatus[stat._id] = stat.count;
      totalOrders += stat.count;
      if (stat._id === "delivered") totalRevenue = stat.revenue;
    }

    // 1b. Monthly revenue (current month, delivered orders only)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyRevenueResult = await Order.aggregate([
      {
        $match: {
          productVendor: vendorId,
          orderStatus: "delivered",
          createdAt: { $gte: startOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $add: ["$productsTotal", "$serviceCharge"] } },
        },
      },
    ]);
    const monthlyRevenue = monthlyRevenueResult[0]?.total ?? 0;

    // 1c. Payment method stats
    const paymentStats = await Order.aggregate([
      { $match: { productVendor: vendorId } },
      { $group: { _id: "$paymentMethod", count: { $sum: 1 } } },
    ]);
    let codOrders = 0;
    let vnpayOrders = 0;
    for (const s of paymentStats) {
      if (s._id === "cod") codOrders = s.count;
      if (s._id === "vnpay") vnpayOrders = s.count;
    }

    // 2. Revenue chart by period (day/month/year)
    let matchCondition: Record<string, unknown>;
    let groupId: Record<string, unknown>;

    if (period === "month") {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      matchCondition = {
        productVendor: vendorId,
        orderStatus: "delivered",
        createdAt: { $gte: startOfYear },
      };
      groupId = { $month: "$createdAt" };
    } else if (period === "year") {
      const fiveYearsAgo = new Date(now.getFullYear() - 4, 0, 1);
      matchCondition = {
        productVendor: vendorId,
        orderStatus: "delivered",
        createdAt: { $gte: fiveYearsAgo },
      };
      groupId = { $year: "$createdAt" };
    } else {
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);
      matchCondition = {
        productVendor: vendorId,
        orderStatus: "delivered",
        createdAt: { $gte: sevenDaysAgo },
      };
      groupId = { $dateToString: { format: "%d/%m", date: "$createdAt" } };
    }

    const revenueRaw = await Order.aggregate([
      { $match: matchCondition },
      { $group: { _id: groupId, revenue: { $sum: { $add: ["$productsTotal", "$serviceCharge"] } } } },
      { $sort: { _id: 1 } },
    ]);

    let revenueChart: { label: string; revenue: number }[] = [];

    if (period === "day") {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const label = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
        const found = revenueRaw.find((r) => r._id === label);
        revenueChart.push({ label, revenue: found?.revenue || 0 });
      }
    } else if (period === "month") {
      const monthNames = ["T1","T2","T3","T4","T5","T6","T7","T8","T9","T10","T11","T12"];
      for (let m = 1; m <= 12; m++) {
        const found = revenueRaw.find((r) => r._id === m);
        revenueChart.push({ label: monthNames[m - 1], revenue: found?.revenue || 0 });
      }
    } else {
      const currentYear = now.getFullYear();
      for (let y = currentYear - 4; y <= currentYear; y++) {
        const found = revenueRaw.find((r) => r._id === y);
        revenueChart.push({ label: String(y), revenue: found?.revenue || 0 });
      }
    }

    // 3. Recent orders
    const recentOrders = await Order.find({ productVendor: vendorId })
      .populate({ path: "buyer", select: "name phone" })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("_id createdAt totalAmount orderStatus buyer")
      .lean();

    // 4. Product stats
    const products = await Product.find({ vendor: vendorId })
      .select("_id title stock image1 isActive verificationStatus isWearable sizeStock")
      .lean();

    const activeProducts = products.filter(
      (p) => p.isActive && p.verificationStatus === "approved",
    ).length;
    const pendingProducts = products.filter(
      (p) => p.verificationStatus === "pending",
    ).length;

    const lowStockProducts = products
      .filter((p) => {
        if (p.isWearable && p.sizeStock && p.sizeStock.length > 0) {
          return p.sizeStock.some((s: { size: string; stock: number }) => s.stock <= 5);
        }
        return p.stock <= 5;
      })
      .map((p) => {
        if (p.isWearable && p.sizeStock && p.sizeStock.length > 0) {
          const lowSizes = p.sizeStock
            .filter((s: { size: string; stock: number }) => s.stock <= 5)
            .map((s: { size: string; stock: number }) => ({ size: s.size, stock: s.stock }));
          return { _id: p._id, title: p.title, stock: p.stock, image1: p.image1, lowSizes };
        }
        return { _id: p._id, title: p.title, stock: p.stock, image1: p.image1, lowSizes: [] };
      });

    return NextResponse.json({
      totalOrders,
      totalRevenue,
      monthlyRevenue,
      pendingOrders: ordersByStatus.pending,
      activeProducts,
      totalProducts: products.length,
      pendingProducts,
      lowStockProducts,
      codOrders,
      vnpayOrders,
      revenueChart,
      ordersByStatus,
      recentOrders,
    });
  } catch (error) {
    return NextResponse.json(
      { message: `Failed to fetch dashboard data: ${error}` },
      { status: 500 },
    );
  }
}
