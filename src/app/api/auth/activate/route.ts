import mongoose from "mongoose";
import { NextRequest } from "next/server";

import connectDB from "@/lib/connectDB";
import { emailIdentityFilter } from "@/lib/security/email";
import { hashToken } from "@/lib/security/otp";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";
import { readLimitedJsonBody } from "@/lib/security/requestBody";
import { noStoreJson } from "@/lib/security/response";
import PendingRegistration from "@/model/pendingRegistration.model";
import User from "@/model/user.model";

const MAX_BODY_BYTES = 4 * 1024;
/** `generateToken()` sinh 32 byte ngẫu nhiên dạng hex, nên token hợp lệ luôn đúng 64 ký tự. */
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

// Một thông điệp duy nhất cho mọi lý do thất bại. Token sai, hết hạn và đã dùng rồi đều dẫn
// tới cùng một hành động của người dùng là xin liên kết mới, nên tách chúng ra chỉ tạo thêm
// một kênh dò xem địa chỉ email nào đang có bản ghi chờ.
const INVALID = "Liên kết không hợp lệ hoặc đã hết hạn.";

// Người bấm liên kết này đã chứng minh mình đọc được hộp thư, nên nói thẳng lý do ở đây không
// tạo kênh dò tài khoản — còn nếu không nói thẳng, họ mất hồ sơ mà không hiểu vì sao.
const EMAIL_TAKEN =
  "Email này vừa được dùng để tạo một tài khoản khác. Vui lòng đăng ký lại bằng email khác.";

/** Kết quả của một lượt kích hoạt ĐÃ COMMIT; response chỉ được dựng từ giá trị này. */
type Outcome = "activated" | "invalid" | "email_taken";

/** Loại tài khoản mà bản ghi chờ yêu cầu tạo. */
type WantedRole = "user" | "vendor";

function wantedRoleOf(intent: unknown): WantedRole {
  return intent === "vendor" ? "vendor" : "user";
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

/**
 * Kích hoạt tài khoản từ liên kết trong mail đăng ký. Đây là nơi DUY NHẤT tạo tài khoản cho
 * luồng đăng ký trực tiếp bằng email và mật khẩu, cho cả người mua và nhà bán.
 *
 * Loại tài khoản đến từ `intent` của BẢN GHI CHỜ, không từ query string: query nằm trong tay
 * người bấm liên kết, còn bản ghi chờ do server ghi lúc đăng ký.
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const ip = clientIp(req.headers);
    if (
      ip &&
      !(await rateLimit(`activate:ip:${ip}`, {
        max: 20,
        windowMs: 15 * 60 * 1000,
      }))
    ) {
      return noStoreJson(
        { message: "Bạn đã thao tác quá nhiều lần. Vui lòng thử lại sau." },
        { status: 429 },
      );
    }

    let body: unknown;
    try {
      body = await readLimitedJsonBody(req, MAX_BODY_BYTES);
    } catch (parseError) {
      if (parseError instanceof RangeError) {
        return noStoreJson({ message: "Dữ liệu quá lớn." }, { status: 413 });
      }
      return noStoreJson({ message: "Dữ liệu không hợp lệ." }, { status: 400 });
    }

    const rawToken = (body as { token?: unknown } | null)?.token;
    // Chặn định dạng trước khi băm: token rác không cần một vòng truy vấn cơ sở dữ liệu.
    if (typeof rawToken !== "string" || !TOKEN_PATTERN.test(rawToken)) {
      return noStoreJson({ message: INVALID }, { status: 400 });
    }

    const tokenHash = hashToken(rawToken);

    // Đọc trước bản ghi chờ CHỈ để giữ lại `_id`, `emailNormalized` và `intent` cho nhánh phục
    // hồi bên dưới. Khi transaction abort vì trùng khoá, mọi thứ đọc trong session đó bị cuốn
    // theo, mà lúc ấy vẫn cần biết identity nào vừa va chạm và nó đòi loại tài khoản nào.
    //
    // Lần đọc này KHÔNG quyết định token hợp lệ hay không: nó không kiểm hạn dùng và có thể
    // cũ ngay khi vừa đọc xong. Thẩm quyền duy nhất là phép claim nguyên tử trong transaction.
    const precheck = await PendingRegistration.findOne({ tokenHash })
      .select("_id emailNormalized intent")
      .lean<{
        _id: mongoose.Types.ObjectId;
        emailNormalized: string;
        intent?: "vendor";
      } | null>();

    let outcome: Outcome;
    const dbSession = await mongoose.startSession();
    try {
      // Kết quả đi ra bằng giá trị trả về của callback chứ không bằng một biến gán từ bên
      // trong. MongoDB chạy lại callback khi gặp lỗi nhất thời, nên một biến gán ở lượt đã bị
      // rollback sẽ sống sót sang lượt sau và báo thành công cho việc chưa hề xảy ra.
      outcome = await dbSession.withTransaction<Outcome>(async () => {
        const claimTime = new Date();

        // Claim có thẩm quyền: đọc và xoá trong một phép nguyên tử, lọc theo CẢ `tokenHash`
        // lẫn hạn dùng.
        //
        // Lọc theo `tokenHash` chứ không theo `_id` là điều kiện bắt buộc: nếu người dùng
        // vừa bấm "gửi lại" thì bản ghi chờ đã mang token mới, và một claim theo `_id` sẽ để
        // token cũ xoá mất bản ghi vừa được cấp lại.
        //
        // Lọc theo `expiresAt` ngay trong filter chứ không đọc rồi so sánh sau: hai request
        // đọc cùng lúc sẽ cùng thấy bản ghi hợp lệ, còn ở đây chỉ một bên xoá được.
        const claimed = await PendingRegistration.findOneAndDelete({
          tokenHash,
          expiresAt: { $gt: claimTime },
        })
          .select("+passwordHash")
          .session(dbSession);

        if (!claimed) return "invalid";

        const wantedRole = wantedRoleOf(claimed.intent);

        // Email có thể đã bị chiếm trong lúc chờ: Google tạo tài khoản người mua ngay khi
        // đăng nhập, và một lượt kích hoạt khác cũng có thể đã xong trước.
        const owner = await User.findOne(
          emailIdentityFilter(claimed.emailNormalized),
        )
          .select("_id role")
          .session(dbSession);

        if (owner) {
          // Cùng loại tài khoản thì coi như đã kích hoạt xong — bấm liên kết hai lần, hoặc
          // hai lượt kích hoạt đua nhau. KHÔNG gắn mật khẩu của lượt đăng ký vào tài khoản
          // đang tồn tại: nó có thể là tài khoản Google không có mật khẩu.
          if (owner.role === wantedRole) return "activated";

          // Khác loại thì đây KHÔNG phải thành công. Người đăng ký nhà bán mà email bị một
          // tài khoản người mua chiếm sẽ chẳng có tài khoản nhà bán nào, nên báo thành công
          // là nói dối họ. Bản ghi chờ đã bị xoá ở trên và phép xoá đó được commit, để lần
          // bấm sau không nhận lại đúng một lỗi cũ.
          //
          // Tuyệt đối không sửa tài khoản đang tồn tại: nó thuộc về một luồng khác.
          return "email_taken";
        }

        // Trùng khoá ở đây KHÔNG được bắt tại chỗ. Sau lỗi ghi đầu tiên, transaction đã hỏng
        // và mọi truy vấn tiếp theo trên cùng session đều bị từ chối, nên một lần "kiểm tra
        // lại rồi coi như thành công" ngay tại đây chỉ đổi lỗi này lấy lỗi khác. Để nó thoát
        // ra ngoài, abort đúng quy trình, rồi phục hồi bằng session sạch bên dưới.
        await User.create(
          [
            {
              name: claimed.name,
              email: claimed.email,
              emailNormalized: claimed.emailNormalized,
              password: claimed.passwordHash,
              role: wantedRole,
              sessionVersion: 0,
              twoFactorEnabled: false,
              // Khẳng định đúng sự thật lần đầu tiên: người dùng vừa chứng minh quyền sở hữu
              // hộp thư bằng cách bấm liên kết gửi tới chính địa chỉ đó.
              emailVerifiedAt: new Date(),
              // Nhà bán mới chưa khai hồ sơ nào nên chưa có gì để duyệt. Phải đặt "draft"
              // TƯỜNG MINH: schema mặc định `verificationStatus` là "pending", nên bỏ trống
              // sẽ đẩy một hồ sơ rỗng vào thẳng hàng chờ của quản trị viên.
              ...(wantedRole === "vendor"
                ? { verificationStatus: "draft" as const, isApproved: false }
                : {}),
            },
          ],
          { session: dbSession },
        );

        return "activated";
      });
    } catch (txError) {
      // Đường duy nhất tới đây mà vẫn coi là thành công: một lượt khác vừa tạo đúng tài khoản
      // này trong khe giữa lần kiểm chủ sở hữu và lệnh ghi. Transaction đã rollback sạch, kể
      // cả phép xoá bản ghi chờ.
      if (!isDuplicateKey(txError) || !precheck) throw txError;

      // Chỉ nhận khi trùng khoá đúng là identity này VÀ đúng loại tài khoản mà bản ghi chờ
      // yêu cầu. Một duplicate ở khoá khác, hoặc một tài khoản khác loại, là chuyện khác hẳn
      // và không được nuốt thành "kích hoạt thành công".
      const raced = await User.findOne(
        emailIdentityFilter(precheck.emailNormalized),
      ).select("_id role");
      if (!raced) throw txError;

      // Dọn bản ghi chờ vừa được rollback. Lọc kèm `tokenHash` để không xoá nhầm bản ghi đã
      // được "gửi lại" cấp token mới: cùng `_id` nhưng mang token khác, và người dùng vẫn
      // đang cầm liên kết mới đó trong hộp thư.
      await PendingRegistration.deleteOne({ _id: precheck._id, tokenHash });
      outcome =
        raced.role === wantedRoleOf(precheck.intent)
          ? "activated"
          : "email_taken";
    } finally {
      await dbSession.endSession();
    }

    if (outcome === "email_taken") {
      return noStoreJson(
        { code: "email_taken", message: EMAIL_TAKEN },
        { status: 409 },
      );
    }

    if (outcome !== "activated") {
      return noStoreJson({ message: INVALID }, { status: 400 });
    }

    return noStoreJson(
      { message: "Kích hoạt thành công. Bạn có thể đăng nhập." },
      { status: 200 },
    );
  } catch (error) {
    console.error("activate error", error);
    return noStoreJson(
      { message: "Không thể kích hoạt lúc này." },
      { status: 500 },
    );
  }
}
