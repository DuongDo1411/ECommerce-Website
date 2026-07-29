"use client";

import axios from "axios";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { AiOutlineSafetyCertificate } from "react-icons/ai";
import { ClipLoader } from "react-spinners";

interface SecurityTabProps {
  user: {
    role?: string;
    hasPassword?: boolean;
    twoFactorEnabled?: boolean;
  };
}

interface ActivityEntry {
  id: string;
  at: string;
  ip: string;
  userAgent: string;
  success: boolean;
  thisDevice: boolean;
}

interface TrustedDeviceEntry {
  id: string;
  label: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  thisDevice: boolean;
}

type TwoFactorChallenge = {
  id: string;
  action: "enable" | "disable";
} | null;

type Feedback = { type: "success" | "error"; text: string } | null;

const errorText = (error: unknown, fallback: string) =>
  (axios.isAxiosError<{ message?: string }>(error)
    ? error.response?.data?.message
    : undefined) ?? fallback;

/** "Mozilla/5.0 (Windows NT 10.0…) … Chrome/…" is noise; show the browser only. */
function browserOf(userAgent: string) {
  if (!userAgent) return "Không rõ";
  const match = userAgent.match(/(Edg|OPR|Chrome|Firefox|Safari)\/[\d.]+/);
  if (!match) return "Không rõ";
  return { Edg: "Edge", OPR: "Opera" }[match[1]] ?? match[1];
}

export default function SecurityTab({ user }: SecurityTabProps) {
  const isGoogleAccount = user.hasPassword === false;
  const isAdmin = user.role === "admin";
  // 2FA (email OTP) is only for password-based User/Vendor accounts.
  const canManage2fa =
    (user.role === "user" || user.role === "vendor") && !isGoogleAccount;
  const loginPath =
    user.role === "vendor"
      ? "/vendor/login"
      : user.role === "admin"
        ? "/admin/login"
        : "/login";
  const [twoFactor, setTwoFactor] = useState(user.twoFactorEnabled === true);
  const [twoFactorChallenge, setTwoFactorChallenge] =
    useState<TwoFactorChallenge>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [savingTwoFactor, setSavingTwoFactor] = useState(false);
  const [twoFactorMessage, setTwoFactorMessage] = useState<Feedback>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [devices, setDevices] = useState<TrustedDeviceEntry[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [revokingDevice, setRevokingDevice] = useState<string | null>(null);
  const [deviceMessage, setDeviceMessage] = useState<Feedback>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [activityResult, deviceResult] = await Promise.allSettled([
          axios.get<{ activity: ActivityEntry[] }>(
            "/api/user/security/activity",
          ),
          axios.get<{ devices: TrustedDeviceEntry[] }>(
            "/api/user/security/devices",
          ),
        ]);
        if (cancelled) return;
        setActivity(
          activityResult.status === "fulfilled"
            ? (activityResult.value.data.activity ?? [])
            : [],
        );
        setDevices(
          deviceResult.status === "fulfilled"
            ? (deviceResult.value.data.devices ?? [])
            : [],
        );
      } catch {
        if (!cancelled) {
          setActivity([]);
          setDevices([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingActivity(false);
          setLoadingDevices(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleTwoFactor = async () => {
    const action = twoFactor ? "disable" : "enable";
    setTwoFactorMessage(null);
    setSavingTwoFactor(true);
    try {
      const res = await axios.post<{ challengeId: string }>(
        "/api/user/security/2fa/initiate",
        { action },
      );
      setTwoFactorChallenge({ id: res.data.challengeId, action });
      setTwoFactorCode("");
      setTwoFactorMessage({
        type: "success",
        text: "Mã xác nhận đã được gửi tới email của bạn.",
      });
    } catch (error) {
      setTwoFactorMessage({
        type: "error",
        text: errorText(error, "Không cập nhật được cài đặt."),
      });
    } finally {
      setSavingTwoFactor(false);
    }
  };

  const handleResendTwoFactor = async () => {
    if (!twoFactorChallenge) return;
    setTwoFactorMessage(null);
    try {
      await axios.post("/api/user/security/2fa/resend-otp", {
        challengeId: twoFactorChallenge.id,
      });
      setTwoFactorCode("");
      setTwoFactorMessage({
        type: "success",
        text: "Đã gửi lại mã tới email của bạn.",
      });
    } catch (error) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      if (status === 404) {
        setTwoFactorChallenge(null);
        setTwoFactorMessage({
          type: "error",
          text: "Phiên đã hết hạn. Vui lòng thử lại.",
        });
      } else if (status === 429) {
        const retry = axios.isAxiosError(error)
          ? Number(error.response?.headers?.["retry-after"]) || 60
          : 60;
        setTwoFactorMessage({
          type: "error",
          text: `Vui lòng chờ ${retry}s trước khi gửi lại mã.`,
        });
      } else {
        setTwoFactorMessage({
          type: "error",
          text: errorText(error, "Không gửi lại được mã."),
        });
      }
    }
  };

  const handleConfirmTwoFactor = async () => {
    if (!twoFactorChallenge || !/^\d{6}$/.test(twoFactorCode)) return;
    setTwoFactorMessage(null);
    setSavingTwoFactor(true);
    try {
      const res = await axios.post<{
        twoFactorEnabled: boolean;
        message?: string;
      }>("/api/user/security/2fa/confirm", {
        challengeId: twoFactorChallenge.id,
        code: twoFactorCode,
      });
      setTwoFactor(res.data.twoFactorEnabled);
      setTwoFactorChallenge(null);
      setTwoFactorCode("");
      // A 2FA policy change revokes every session and remembered device. Clear
      // the now-stale Auth.js cookie before returning to the login portal.
      await signOut({ callbackUrl: loginPath });
    } catch (error) {
      setTwoFactorMessage({
        type: "error",
        text: errorText(error, "Mã xác nhận không đúng hoặc đã hết hạn."),
      });
      setSavingTwoFactor(false);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    setDeviceMessage(null);
    setRevokingDevice(deviceId);
    try {
      await axios.delete(`/api/user/security/devices/${deviceId}`);
      setDevices((current) =>
        current.filter((device) => device.id !== deviceId),
      );
      setDeviceMessage({
        type: "success",
        text: "Đã xoá thiết bị khỏi danh sách tin cậy.",
      });
    } catch (error) {
      setDeviceMessage({
        type: "error",
        text: errorText(error, "Không thể thu hồi thiết bị này."),
      });
    } finally {
      setRevokingDevice(null);
    }
  };

  const handleLogoutEverywhere = async () => {
    setLoggingOut(true);
    try {
      await axios.post("/api/user/security/logout-all");
      // This browser's token was revoked too, so clear it and go to /login
      // instead of leaving a session that every request would now reject.
      await signOut({ callbackUrl: loginPath });
    } catch {
      setLoggingOut(false);
    }
  };

  const cardCls =
    "bg-linear-to-br from-white/[0.075] to-white/[0.035] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/25";

  return (
    <div className="space-y-6">
      <section className={cardCls}>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
            <AiOutlineSafetyCertificate className="text-blue-300" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Bảo mật</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Xác minh 2 bước, thiết bị đăng nhập và nhật ký truy cập.
            </p>
          </div>
        </div>

        {!canManage2fa ? (
          <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
            {isAdmin
              ? "Tài khoản quản trị không sử dụng xác minh 2 bước qua email."
              : "Tài khoản đăng nhập bằng Google — lớp xác minh 2 bước do Google quản lý."}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-white">
                  Xác minh 2 bước qua email
                </p>
                <p className="text-sm text-gray-500 mt-1 max-w-md">
                  Khi bật, đăng nhập từ thiết bị/trình duyệt lạ cần mã OTP gửi
                  tới email; thiết bị đã xác thực được nhớ 30 ngày. Khi tắt,
                  không cần mã.
                </p>
              </div>
              <span
                className={`shrink-0 px-3 py-1 rounded-lg text-xs font-bold border ${
                  twoFactor
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-200"
                    : "bg-white/5 border-white/10 text-gray-400"
                }`}
              >
                {twoFactor ? "ĐANG BẬT" : "ĐANG TẮT"}
              </span>
            </div>

            {twoFactorChallenge && (
              <div className="space-y-3">
                <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
                  Mã xác nhận gồm 6 chữ số
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={(e) =>
                    setTwoFactorCode(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="______"
                  className="w-full py-3.5 px-4 bg-white/5 border border-white/10 rounded-xl focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/15 focus:outline-none transition-all text-center tracking-[0.5em] text-white placeholder-gray-600"
                />
              </div>
            )}

            {twoFactorMessage && (
              <div
                className={`rounded-xl border px-4 py-3 text-sm ${
                  twoFactorMessage.type === "success"
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                    : "border-red-500/25 bg-red-500/10 text-red-200"
                }`}
              >
                {twoFactorMessage.text}
              </div>
            )}

            {twoFactorChallenge ? (
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleConfirmTwoFactor}
                  disabled={savingTwoFactor || twoFactorCode.length !== 6}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 disabled:from-gray-700 disabled:to-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed px-6 py-3.5 font-semibold shadow-lg shadow-blue-500/10 transition-all"
                >
                  {savingTwoFactor ? (
                    <ClipLoader color="white" size={18} />
                  ) : (
                    "Xác nhận thay đổi"
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleResendTwoFactor}
                  disabled={savingTwoFactor}
                  className="rounded-xl border border-white/10 px-6 py-3.5 font-semibold text-blue-300 hover:bg-white/5 disabled:opacity-60"
                >
                  Gửi lại mã
                </button>
                <button
                  onClick={() => {
                    setTwoFactorChallenge(null);
                    setTwoFactorCode("");
                    setTwoFactorMessage(null);
                  }}
                  disabled={savingTwoFactor}
                  className="rounded-xl border border-white/10 px-6 py-3.5 font-semibold text-gray-300 hover:bg-white/5 disabled:opacity-60"
                >
                  Huỷ
                </button>
              </div>
            ) : (
              <button
                onClick={handleToggleTwoFactor}
                disabled={savingTwoFactor}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 disabled:from-gray-700 disabled:to-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed px-6 py-3.5 font-semibold shadow-lg shadow-blue-500/10 transition-all"
              >
                {savingTwoFactor ? (
                  <ClipLoader color="white" size={18} />
                ) : twoFactor ? (
                  "Tắt xác minh 2 bước"
                ) : (
                  "Bật xác minh 2 bước"
                )}
              </button>
            )}
          </div>
        )}
      </section>

      {canManage2fa && (
      <section className={cardCls}>
        <h2 className="text-lg font-bold text-white">Thiết bị tin cậy</h2>
        <p className="text-sm text-gray-500 mt-1 mb-5 max-w-lg">
          Khi bật xác minh 2 bước, thiết bị đã xác thực được bỏ qua OTP trong 30
          ngày. Bạn có thể thu hồi từng thiết bị bất cứ lúc nào.
        </p>

        {deviceMessage && (
          <div
            className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
              deviceMessage.type === "success"
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                : "border-red-500/25 bg-red-500/10 text-red-200"
            }`}
          >
            {deviceMessage.text}
          </div>
        )}

        {loadingDevices ? (
          <div className="py-8 flex justify-center">
            <ClipLoader color="#60a5fa" size={24} />
          </div>
        ) : devices.length === 0 ? (
          <p className="text-sm text-gray-500">Chưa có thiết bị tin cậy.</p>
        ) : (
          <div className="space-y-3">
            {devices.map((device) => (
              <div
                key={device.id}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-200">
                    {browserOf(device.label)}
                    {device.thisDevice && (
                      <span className="ml-2 text-[10px] font-bold text-blue-300">
                        THIẾT BỊ NÀY
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Hoạt động gần nhất: {new Date(device.lastSeenAt).toLocaleString("vi-VN")}
                  </p>
                </div>
                <button
                  onClick={() => handleRevokeDevice(device.id)}
                  disabled={revokingDevice === device.id}
                  className="shrink-0 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-60"
                >
                  {revokingDevice === device.id ? (
                    <ClipLoader color="#fca5a5" size={15} />
                  ) : (
                    "Thu hồi"
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      <section className={cardCls}>
        <h2 className="text-lg font-bold text-white">
          Đăng xuất khỏi mọi thiết bị
        </h2>
        <p className="text-sm text-gray-500 mt-1 mb-5 max-w-lg">
          Huỷ toàn bộ phiên đăng nhập đang hoạt động, kể cả trên trình duyệt
          này. Dùng khi bạn nghi ngờ tài khoản bị truy cập trái phép.
        </p>
        <button
          onClick={handleLogoutEverywhere}
          disabled={loggingOut}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-200 disabled:opacity-60 disabled:cursor-not-allowed px-6 py-3.5 font-semibold transition-all"
        >
          {loggingOut ? (
            <ClipLoader color="#fca5a5" size={18} />
          ) : (
            "Đăng xuất tất cả"
          )}
        </button>
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-bold text-white">Nhật ký đăng nhập</h2>
        <p className="text-sm text-gray-500 mt-1 mb-5">
          20 lần đăng nhập gần nhất. Nếu thấy hoạt động lạ, hãy đổi mật khẩu
          ngay.
        </p>

        {loadingActivity ? (
          <div className="py-8 flex justify-center">
            <ClipLoader color="#60a5fa" size={24} />
          </div>
        ) : activity.length === 0 ? (
          <p className="text-sm text-gray-500">Chưa có dữ liệu.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-gray-500 border-b border-white/10">
                  <th className="py-3 pr-4 font-bold">Thời gian</th>
                  <th className="py-3 pr-4 font-bold">Trình duyệt</th>
                  <th className="py-3 pr-4 font-bold">IP</th>
                  <th className="py-3 font-bold">Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((entry) => (
                  <tr key={entry.id} className="border-b border-white/5">
                    <td className="py-3 pr-4 text-gray-300 whitespace-nowrap">
                      {new Date(entry.at).toLocaleString("vi-VN")}
                    </td>
                    <td className="py-3 pr-4 text-gray-400">
                      {browserOf(entry.userAgent)}
                      {entry.thisDevice && (
                        <span className="ml-2 text-[10px] font-bold text-blue-300">
                          THIẾT BỊ NÀY
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-gray-400 font-mono text-xs">
                      {entry.ip}
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-1 rounded-md text-[11px] font-bold ${
                          entry.success
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-red-500/15 text-red-300"
                        }`}
                      >
                        {entry.success ? "Thành công" : "Thất bại"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
