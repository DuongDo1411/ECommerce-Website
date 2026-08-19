"use client";
import { IUser } from "@/model/user.model";
import React from "react";
import VendorDashBoard from "./VendorDashBoard";
import { useRouter } from "next/navigation";

/**
 * `vendor/page.tsx` truyền user qua `JSON.parse(JSON.stringify(user))`, nên trường ngày tới
 * đây là chuỗi ISO dù kiểu khai báo là `Date`. Khoá cứng locale và múi giờ để lần render trên
 * server và lần hydrate trên client cho ra cùng một chuỗi; để mặc định thì máy khách ở múi giờ
 * khác sẽ sinh lỗi hydration.
 */
const SUBMITTED_AT_FORMAT = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

function formatSubmittedAt(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : SUBMITTED_AT_FORMAT.format(date);
}

/**
 * Vỏ chung cho mọi màn hình trạng thái. Ba trạng thái chờ duyệt, bị từ chối và hồ sơ chưa
 * hoàn tất dùng cùng một vỏ nên không thể lệch nhau về bo góc, khoảng cách hay thang chữ.
 */
function StatusShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full min-h-screen flex items-center justify-center px-4 pt-20 pb-12">
      <div className="w-full max-w-xl bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8">
        {children}
      </div>
    </div>
  );
}

function StatusHeader({
  icon,
  iconClass,
  title,
  description,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  description: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <div
        className={`shrink-0 w-11 h-11 rounded-xl border flex items-center justify-center ${iconClass}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        <p className="mt-1.5 text-sm text-gray-400 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

/** Một dòng thông tin hồ sơ. Bỏ hẳn dòng nếu chưa có giá trị, không in ra dấu gạch trống. */
function InfoRow({
  label,
  value,
  wide = false,
}: {
  label: string;
  value?: string | null;
  wide?: boolean;
}) {
  if (!value) return null;
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-200 break-words">{value}</dd>
    </div>
  );
}

const ClockIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    className="w-5 h-5"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 1.8" />
  </svg>
);

const AlertIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    className="w-5 h-5"
    aria-hidden="true"
  >
    <path d="M12 9v4.5" />
    <path d="M12 17h.01" />
    <path d="M10.3 4.2 2.9 17a1.9 1.9 0 0 0 1.7 2.9h14.8a1.9 1.9 0 0 0 1.7-2.9L13.7 4.2a1.9 1.9 0 0 0-3.4 0Z" />
  </svg>
);

const FormIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    className="w-5 h-5"
    aria-hidden="true"
  >
    <path d="M8 4h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
    <path d="M9.5 9h5M9.5 13h5M9.5 17h2.5" />
  </svg>
);

/**
 * Ba bước của vòng đời hồ sơ, đúng theo state machine phía server: khai hồ sơ đưa trạng thái
 * sang `pending`, quản trị viên duyệt đưa sang `approved`, và chỉ khi đó nhà bán mới đăng được
 * sản phẩm. Bước đang chạy được đánh dấu bằng `aria-current` cho trình đọc màn hình.
 */
const PENDING_STEPS = [
  { label: "Khai hồ sơ shop", note: "Đã gửi" },
  { label: "Quản trị viên duyệt", note: "Đang xử lý" },
  { label: "Đăng sản phẩm và bán hàng", note: "Sau khi được duyệt" },
];

function PendingSteps() {
  return (
    <ol className="mt-6">
      {PENDING_STEPS.map((step, index) => {
        const isDone = index === 0;
        const isCurrent = index === 1;
        const isLast = index === PENDING_STEPS.length - 1;
        return (
          <li
            key={step.label}
            aria-current={isCurrent ? "step" : undefined}
            className={`relative flex gap-3 ${isLast ? "" : "pb-5"}`}
          >
            {!isLast && (
              <span
                className="absolute left-[5px] top-4 bottom-0 w-px bg-white/10"
                aria-hidden="true"
              />
            )}
            <span className="relative mt-1.5 shrink-0 flex h-[11px] w-[11px] items-center justify-center">
              {isCurrent && (
                <span
                  className="absolute h-full w-full rounded-full bg-blue-500/30 animate-pulse"
                  aria-hidden="true"
                />
              )}
              <span
                className={`relative h-[7px] w-[7px] rounded-full ${
                  isDone
                    ? "bg-blue-500"
                    : isCurrent
                      ? "bg-blue-400"
                      : "bg-white/25"
                }`}
                aria-hidden="true"
              />
            </span>
            <div className="-mt-0.5">
              <p
                className={`text-sm ${
                  isCurrent ? "text-white font-medium" : "text-gray-300"
                }`}
              >
                {step.label}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">{step.note}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function VendorPage({ user }: { user: IUser }) {
  const router = useRouter();

  /**
   * Gửi lại hồ sơ đi qua form đầy đủ, không gửi từ đây.
   *
   * Trước đây nút này POST thẳng ba trường tên shop, địa chỉ dạng chữ tự do và mã số thuế.
   * Địa chỉ như vậy không dùng được cho GHN — vận đơn cần mã tỉnh, quận, phường — và hồ sơ
   * cũng thiếu số điện thoại lấy hàng. Server giờ từ chối một payload như thế, nên đúng chỗ
   * để gửi lại là form khai hồ sơ.
   */
  const handleVerifyAgain = () => {
    router.push("/vendor/profile");
  };

  if (!user) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center text-sm text-gray-400">
        Đang tải…
      </div>
    );
  }

  if (user.verificationStatus == "approved") {
    return (
      <div className="w-full min-h-screen pt-16">
        <VendorDashBoard user={user} />
      </div>
    );
  }

  if (user.verificationStatus == "pending") {
    const submittedAt = formatSubmittedAt(user.requestedAt);
    return (
      <StatusShell>
        <StatusHeader
          icon={ClockIcon}
          iconClass="bg-blue-500/10 border-blue-500/25 text-blue-400"
          title="Hồ sơ đang chờ duyệt"
          description={
            <>
              Quản trị viên đang xem hồ sơ shop của bạn. Kết quả được gửi tới{" "}
              <span className="text-gray-200">{user.email}</span>, thường trong
              vòng 24–48 giờ làm việc.
            </>
          }
        />

        <PendingSteps />

        <dl className="mt-6 pt-6 border-t border-white/10 grid gap-4 sm:grid-cols-2">
          <InfoRow label="Tên shop" value={user.shopName} />
          <InfoRow label="Số điện thoại lấy hàng" value={user.phone} />
          <InfoRow label="Địa chỉ kho" value={user.shopAddress} wide />
          <InfoRow label="Mã số thuế" value={user.taxNumber} />
          <InfoRow label="Gửi lúc" value={submittedAt} />
        </dl>

        {/* Nói rõ hồ sơ bị khoá, vì `submitVendorProfile` trả 409 invalid_vendor_transition cho
            một hồ sơ đã đủ đang ở trạng thái pending. Đưa nút "sửa hồ sơ" vào đây sẽ dẫn người
            bán tới một form không lưu được. */}
        <p className="mt-6 pt-6 border-t border-white/10 text-xs text-gray-500 leading-relaxed">
          Hồ sơ được giữ nguyên trong lúc chờ để quản trị viên và bạn cùng xem
          một bản. Nếu bị từ chối, bạn sẽ thấy lý do ngay tại đây và sửa lại
          được.
        </p>
      </StatusShell>
    );
  }

  if (user.verificationStatus == "rejected") {
    return (
      <StatusShell>
        <StatusHeader
          icon={AlertIcon}
          iconClass="bg-red-500/10 border-red-500/25 text-red-400"
          title="Hồ sơ chưa được duyệt"
          description="Quản trị viên đã xem và từ chối hồ sơ shop của bạn. Sửa theo lý do dưới đây rồi gửi lại."
        />

        <div className="mt-6 bg-red-500/5 border border-red-500/20 rounded-xl p-4">
          <p className="text-xs text-red-400">Lý do từ chối</p>
          <p className="mt-2 text-sm text-gray-200 leading-relaxed">
            {user.rejectedReason ||
              "Quản trị viên không ghi lý do cụ thể. Bạn kiểm tra lại tên shop, địa chỉ kho, số điện thoại và mã số thuế trước khi gửi lại."}
          </p>
        </div>

        {/* Ba ô nhập tại chỗ đã được bỏ. Chúng thu tên shop, địa chỉ dạng chữ tự do và mã số
            thuế, nhưng hồ sơ còn cần số điện thoại lấy hàng và địa chỉ có mã tỉnh, quận, phường
            của GHN. Gửi thiếu thì server từ chối, nên đưa thẳng người dùng tới form khai hồ sơ
            đầy đủ. */}
        <button
          onClick={handleVerifyAgain}
          className="mt-6 w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-medium transition-colors"
        >
          Sửa hồ sơ và gửi lại
        </button>

        <p className="mt-4 text-xs text-gray-500">
          Hồ sơ đã khai vẫn còn, bạn chỉ cần sửa phần cần thiết.
        </p>
      </StatusShell>
    );
  }

  // Trạng thái `draft` bình thường không tới đây: `vendor/page.tsx` đã đưa hồ sơ chưa hoàn tất
  // vào form khai. Nhánh này để một giá trị ngoài dự kiến không render ra trang trắng.
  return (
    <StatusShell>
      <StatusHeader
        icon={FormIcon}
        iconClass="bg-white/5 border-white/15 text-gray-300"
        title="Hồ sơ shop chưa hoàn tất"
        description="Khai đủ thông tin shop để gửi cho quản trị viên duyệt."
      />
      <button
        onClick={handleVerifyAgain}
        className="mt-6 w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-medium transition-colors"
      >
        Khai hồ sơ shop
      </button>
    </StatusShell>
  );
}

export default VendorPage;
