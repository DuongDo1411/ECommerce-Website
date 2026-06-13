import { createServer } from "http";
import { loadEnvConfig } from "@next/env";
import next from "next";
import { Server } from "socket.io";

loadEnvConfig(process.cwd());

const port = Number.parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "localhost";
const dev = process.env.NODE_ENV !== "production";
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

  const io = new Server(httpServer, {
    cors: {
      origin: true,
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
