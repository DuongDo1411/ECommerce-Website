import { createServer } from "http";
import { loadEnvConfig } from "@next/env";
import next from "next";
import { Server } from "socket.io";

import { validateMailConfiguration } from "./src/lib/mail/provider";
import { configuredOrigins } from "./src/lib/security/origins";

loadEnvConfig(process.cwd());

// Fail closed: OTP / token hashing (2FA, password reset, verification) depends
// on a stable pepper. Never boot production without it.
if (process.env.NODE_ENV === "production" && !process.env.AUTH_TOKEN_PEPPER) {
  throw new Error(
    "AUTH_TOKEN_PEPPER is required in production — refusing to start.",
  );
}

// Fail closed: cấu hình mail sai chỉ lộ ra ở request đầu tiên cần gửi OTP — thường là lúc
// một người dùng thật đang đứng chờ. Ném ngay tại đây để lỗi rơi vào lúc deploy.
validateMailConfiguration();

// Lỗi cấp request của Next.js nổi lên thành promise bị reject mà không ai bắt, và Node từ
// v15 coi đó là lỗi chí tử rồi thoát. Hậu quả đã xảy ra thật ở production: một tab trình
// duyệt còn giữ Server Action ID của bản build cũ gửi request lên, Next ném lỗi
// "Server Reference ID did not match", tiến trình chết và MỌI người đang dùng bị ngắt.
//
// Một request hỏng không được phép thành sự cố toàn hệ thống. Ghi log rồi phục vụ tiếp.
// Đăng ký ở cấp module để phủ cả giai đoạn khởi động, trước khi có HTTP server.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

const port = Number.parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
// Production phải bind 0.0.0.0: nền tảng hosting đưa traffic vào container qua network
// interface, bind localhost thì health check không tới được và deploy bị đánh là thất bại.
// Dev giữ localhost để không mở cổng ra toàn mạng LAN khi đang lập trình.
const hostname = process.env.HOSTNAME || (dev ? "localhost" : "0.0.0.0");
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const [{ registerSocketHandlers }, { setIO }] = await Promise.all([
    import("./src/lib/socket-handlers"),
    import("./src/lib/socket-server"),
  ]);

  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  // Lock the WebSocket handshake to deployment-owned origins instead of
  // reflecting whatever Origin the client sends (`origin: true`). In dev this
  // falls back to localhost; in prod it must be configured or we refuse to
  // start with open CORS.
  const allowedOrigins = configuredOrigins();
  if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
    throw new Error(
      "Socket.IO CORS: no origins configured — set AUTH_URL or ALLOWED_ORIGINS.",
    );
  }

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  setIO(io);
  registerSocketHandlers(io);

  httpServer.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? "development" : process.env.NODE_ENV
      }`,
    );
  });

  // Nền tảng hosting gửi SIGTERM khi deploy hoặc khởi động lại, chờ một lúc, rồi SIGKILL.
  // Không xử lý tín hiệu thì tiến trình bị giết thô: client Socket.IO mất kết nối giữa
  // luồng thay vì được thông báo, và Atlas thấy socket bị đứt chứ không phải ngắt tử tế.
  let shuttingDown = false;
  const shutdown = async (reason: string) => {
    if (shuttingDown) return; // SIGTERM rồi SIGINT liên tiếp không được chạy hai lần.
    shuttingDown = true;
    console.log(`> shutting down (${reason})`);

    // Trần thời gian tự đặt, thấp hơn hạn của nền tảng: thà tự thoát với mã rõ ràng còn
    // hơn treo rồi bị SIGKILL, vì SIGKILL không để lại dấu vết nào trong log.
    const forceExit = setTimeout(() => {
      console.error("> shutdown exceeded 10s — forcing exit");
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    try {
      // Ngắt client trước rồi mới đóng HTTP server. Gọi io.close() sẽ tự đóng luôn HTTP
      // server bên dưới, khiến lần close() thứ hai báo lỗi "Server is not running".
      io.disconnectSockets(true);
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      const { default: mongoose } = await import("mongoose");
      await mongoose.connection.close();
    } catch (error) {
      console.error("> shutdown error", error);
    }

    clearTimeout(forceExit);
    process.exit(reason === "uncaughtException" ? 1 : 0);
  };

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => void shutdown(signal));
  }

  // Khác với unhandledRejection: tới đây trạng thái tiến trình đã không còn tin được nữa,
  // nên phải thoát. Nhưng thoát có trật tự và có log, để nền tảng dựng instance mới.
  process.on("uncaughtException", (error) => {
    console.error("[uncaughtException]", error);
    void shutdown("uncaughtException");
  });
});
