import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import { normalizeSearch, paginationMeta, parsePagination } from "@/lib/voucher/query";
import UserVoucher from "@/model/userVoucher.model";
import { NextRequest, NextResponse } from "next/server";

const USER_VOUCHER_STATUSES = ["collected", "reserved", "used", "expired"];

type LeanVoucher = {
  code?: string;
  title?: string;
  discountType?: string;
  vendor?: unknown;
  endAt?: string | Date;
};
type WalletRow = {
  _id: unknown;
  status: string;
  createdAt?: string | Date;
  voucher?: LeanVoucher | null;
};

function matchSlot(voucher: LeanVoucher | null | undefined, slot: string | null): boolean {
  if (!slot || slot === "all") return true;
  const isFreeship = voucher?.discountType === "freeship";
  if (slot === "freeship") return isFreeship;
  if (slot === "platform") return !isFreeship && !voucher?.vendor;
  if (slot === "shop") return !isFreeship && Boolean(voucher?.vendor);
  return true;
}

function matchSearch(voucher: LeanVoucher | null | undefined, q: string): boolean {
  if (!q) return true;
  return (
    (voucher?.code ?? "").toLowerCase().includes(q) ||
    (voucher?.title ?? "").toLowerCase().includes(q)
  );
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const params = req.nextUrl.searchParams;
    const status = params.get("status");
    if (status && !USER_VOUCHER_STATUSES.includes(status)) {
      return NextResponse.json({ message: "status khong hop le" }, { status: 400 });
    }
    const slot = params.get("slot");
    const q = normalizeSearch(params.get("q")).toLowerCase();
    const sort = params.get("sort");
    const { page, limit, skip } = parsePagination(
      params.get("page"),
      params.get("limit"),
      { defaultLimit: 24, maxLimit: 50 },
    );

    const now = new Date();

    // Expire trước khi query: collected nhưng voucher đã hết hạn -> expired.
    const collectedRows = await UserVoucher.find({
      user: session.user.id,
      status: "collected",
    })
      .populate({ path: "voucher", select: "endAt" })
      .select("_id voucher")
      .lean<{ _id: unknown; voucher?: { endAt?: string | Date } | null }[]>();
    const toExpire = collectedRows
      .filter((row) => row.voucher?.endAt && new Date(row.voucher.endAt) < now)
      .map((row) => row._id);
    if (toExpire.length > 0) {
      await UserVoucher.updateMany(
        { _id: { $in: toExpire }, status: "collected" },
        { $set: { status: "expired" } },
      );
    }

    const filter: Record<string, unknown> = { user: session.user.id };
    if (status) filter.status = status;

    const rows = await UserVoucher.find(filter)
      .populate("voucher")
      .sort({ createdAt: -1 })
      .lean<WalletRow[]>();

    // Lọc slot + search trên voucher đã populate (ví của 1 user là tập nhỏ nên
    // lọc trong bộ nhớ rồi phân trang là đủ; không tải full dataset toàn hệ thống).
    let filtered = rows.filter(
      (row) => matchSlot(row.voucher, slot) && matchSearch(row.voucher, q),
    );

    if (sort === "endingSoon") {
      filtered = filtered.slice().sort((a, b) => {
        const ea = a.voucher?.endAt ? new Date(a.voucher.endAt).getTime() : Infinity;
        const eb = b.voucher?.endAt ? new Date(b.voucher.endAt).getTime() : Infinity;
        return ea - eb;
      });
    }

    const total = filtered.length;
    const pageRows = filtered.slice(skip, skip + limit);

    return NextResponse.json(
      { vouchers: pageRows, pagination: paginationMeta(total, page, limit) },
      { status: 200 },
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Khong the tai voucher" }, { status: 500 });
  }
}
