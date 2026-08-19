"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  classifyActivationStatus,
  shouldDiscardActivationToken,
} from "@/lib/auth/activationOutcome";
import {
  REGISTRATION_TOKEN_STORAGE_KEY,
  resolveFragmentSecret,
} from "@/lib/security/fragmentSecret";

type Phase = "working" | "done" | "invalid" | "taken" | "retryable";

const INVALID_MESSAGE = "Liên kết không hợp lệ hoặc đã hết hạn.";

export default function ActivatePage() {
  const router = useRouter();
  const tokenRef = useRef("");
  // React Strict Mode chạy effect hai lần ở môi trường phát triển. Không có cờ này thì trang
  // tự gửi hai request kích hoạt cho cùng một token: request thứ hai chắc chắn thất bại vì
  // bản ghi chờ đã bị claim, và phản hồi lỗi của nó sẽ ghi đè lên trạng thái thành công vừa
  // hiện. Cờ chỉ chặn lần gửi TỰ ĐỘNG; nút "thử lại" vẫn bấm được bao nhiêu lần tuỳ người dùng.
  const startedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("working");
  const [message, setMessage] = useState("Đang kích hoạt tài khoản…");
  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState("");

  // Đọc trong effect thay vì dùng useSearchParams(): hook đó buộc trang phải nằm trong một
  // Suspense boundary khi được prerender, còn trang này không cần tới điều đó cho một tham
  // số chỉ ảnh hưởng tới đích của mấy cái nút.
  //
  // `intent` ở đây CHỈ chọn đường dẫn hiển thị. Loại tài khoản được tạo do bản ghi chờ phía
  // server quyết định, không do query string này.
  const [loginHref, setLoginHref] = useState("/login");
  const [registerHref, setRegisterHref] = useState("/register");

  /**
   * Gửi một lượt kích hoạt. Dùng chung cho lần tự gửi đầu tiên và cho nút "thử lại", nên hai
   * đường đó không thể xử lý lỗi lệch nhau.
   */
  const submitActivation = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) {
      setPhase("invalid");
      setMessage(INVALID_MESSAGE);
      return;
    }

    setPhase("working");
    setMessage("Đang kích hoạt tài khoản…");

    // Chỉ mã HTTP mới nói được server đã kết luận gì. Không nhận được phản hồi thì để null,
    // và null được xếp vào nhóm thử lại được.
    let status: number | null = null;
    let serverMessage: string | undefined;
    try {
      const res = await axios.post("/api/auth/activate", { token });
      status = res.status;
      serverMessage = (res.data as { message?: string })?.message;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response) {
        status = error.response.status;
        serverMessage = (error.response.data as { message?: string })?.message;
      }
    }

    const outcome = classifyActivationStatus(status);
    if (shouldDiscardActivationToken(outcome)) {
      tokenRef.current = "";
      window.sessionStorage.removeItem(REGISTRATION_TOKEN_STORAGE_KEY);
    }

    if (outcome === "activated") {
      setPhase("done");
      setMessage(serverMessage ?? "Kích hoạt thành công. Bạn có thể đăng nhập.");
      return;
    }

    // Email đã thuộc về một tài khoản khác loại. Không mời gửi lại liên kết: bản ghi chờ đã
    // bị dọn và địa chỉ đó không còn dùng được cho luồng này nữa.
    if (outcome === "taken") {
      setPhase("taken");
      setMessage(
        serverMessage ??
          "Email này vừa được dùng để tạo một tài khoản khác. Vui lòng đăng ký lại bằng email khác.",
      );
      return;
    }

    if (outcome === "invalid") {
      setPhase("invalid");
      setMessage(serverMessage ?? INVALID_MESSAGE);
      return;
    }

    // Token vẫn còn trong tay: đừng bắt người dùng đi xin liên kết mới khi thứ hỏng là mạng
    // hoặc máy chủ chứ không phải liên kết của họ.
    setPhase("retryable");
    setMessage(
      status === null
        ? "Không kết nối được tới máy chủ. Liên kết vẫn còn dùng được, bạn thử lại nhé."
        : "Máy chủ đang bận. Liên kết vẫn còn dùng được, bạn thử lại nhé.",
    );
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (new URLSearchParams(window.location.search).get("intent") === "vendor") {
      setLoginHref("/vendor/login");
      setRegisterHref("/vendor/register");
    }

    tokenRef.current = resolveFragmentSecret(
      tokenRef.current,
      window.location.hash,
      "token",
      window.sessionStorage.getItem(REGISTRATION_TOKEN_STORAGE_KEY),
    );
    if (tokenRef.current) {
      // Lưu lại để nút "thử lại" còn token dùng sau khi fragment đã bị gỡ khỏi URL.
      window.sessionStorage.setItem(
        REGISTRATION_TOKEN_STORAGE_KEY,
        tokenRef.current,
      );
    }
    // Giữ token khỏi lịch sử trình duyệt, ảnh chụp màn hình và URL được copy, ngay khi phía
    // client đã bắt được nó.
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );

    void submitActivation();
  }, [submitActivation]);

  const resend = useCallback(async () => {
    if (!email.trim()) {
      setResendNote("Vui lòng nhập email bạn đã dùng để đăng ký.");
      return;
    }
    setResending(true);
    setResendNote("");
    try {
      const res = await axios.post("/api/auth/register/resend", {
        email: email.trim(),
      });
      setResendNote(
        (res.data as { message?: string })?.message ??
          "Nếu email đang chờ kích hoạt, chúng tôi đã gửi lại liên kết.",
      );
    } catch (error: unknown) {
      setResendNote(
        axios.isAxiosError<{ message?: string }>(error)
          ? (error.response?.data?.message ?? "Không gửi lại được lúc này.")
          : "Không gửi lại được lúc này.",
      );
    } finally {
      setResending(false);
    }
  }, [email]);

  const primaryButton =
    "w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold";
  const secondaryButton =
    "w-full py-3 bg-white/5 border border-white/10 rounded-xl font-medium text-gray-200";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white p-6">
      <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-8">
        <h1 className="text-2xl font-bold mb-2">Kích hoạt tài khoản</h1>
        <p className="text-gray-300 text-sm mb-6">{message}</p>

        {phase === "done" && (
          <button
            onClick={() => router.push(loginHref)}
            className={primaryButton}
          >
            Đăng nhập
          </button>
        )}

        {/* Liên kết còn sống, chỉ lượt gửi vừa rồi hỏng: mời bấm lại, không mời xin liên kết mới. */}
        {phase === "retryable" && (
          <div className="space-y-3">
            <button
              onClick={() => void submitActivation()}
              className={primaryButton}
            >
              Thử kích hoạt lại
            </button>
            <button
              onClick={() => router.push(loginHref)}
              className={secondaryButton}
            >
              Đã kích hoạt rồi? Đăng nhập
            </button>
          </div>
        )}

        {phase === "taken" && (
          <div className="space-y-3">
            <button
              onClick={() => router.push(registerHref)}
              className={primaryButton}
            >
              Đăng ký lại bằng email khác
            </button>
            <button
              onClick={() => router.push(loginHref)}
              className={secondaryButton}
            >
              Về trang đăng nhập
            </button>
          </div>
        )}

        {phase === "invalid" && (
          <div className="space-y-4">
            {/* Trang không thể suy ra email từ một token sai hoặc đã hết hạn, nên phải hỏi. */}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email bạn đã dùng để đăng ký"
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:border-blue-500"
            />
            <button
              onClick={resend}
              disabled={resending}
              className={`${primaryButton} disabled:opacity-60`}
            >
              {resending ? "Đang gửi…" : "Gửi lại liên kết kích hoạt"}
            </button>
            {resendNote && <p className="text-sm text-gray-400">{resendNote}</p>}
            <button
              onClick={() => router.push(loginHref)}
              className={secondaryButton}
            >
              Đã kích hoạt rồi? Đăng nhập
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
