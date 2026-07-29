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
});
