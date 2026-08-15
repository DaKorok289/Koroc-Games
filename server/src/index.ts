import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import { createServer } from "http";
import { Server } from "socket.io";
import { authRouter } from "./routes/auth";
import { registerRealtime } from "./realtime";
import { initDb, promoteAdminsFromEnv, grantAllCosmeticsFromEnv } from "./db";

const PORT = Number(process.env.PORT) || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Reflects the request origin so any device on the LAN (iPad/phone/desktop, each
// with a different origin like http://192.168.x.x:5173) can hit the API with cookies.
const corsOptions: cors.CorsOptions = {
  origin: CLIENT_ORIGIN ?? true,
  credentials: true,
};

const app = express();
app.set("trust proxy", 1); // Render (and most hosts) sit behind a reverse proxy
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

app.use("/api", authRouter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsOptions,
});

registerRealtime(io);

// In production, this single service also serves the built client (same origin as
// the API and Socket.io — no CORS or cross-origin cookie complications). Requests to
// /socket.io/* are intercepted by Engine.IO before they ever reach Express, so this
// catch-all only ever sees ordinary page loads.
if (IS_PRODUCTION) {
  const clientDist = path.join(__dirname, "..", "..", "client", "dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

async function start() {
  await initDb();
  await promoteAdminsFromEnv();
  await grantAllCosmeticsFromEnv();
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Koroc Games server listening on http://0.0.0.0:${PORT}`);
  });
}

start();
