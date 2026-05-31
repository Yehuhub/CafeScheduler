import "dotenv/config";
import express from "express";
import session from "express-session";
import ConnectSqlite3 from "connect-sqlite3";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import weekRoutes from "./routes/weeks";
import availabilityRoutes from "./routes/availability";
import requirementRoutes from "./routes/requirements";
import shiftCountRoutes from "./routes/shiftCounts";
import assignmentRoutes from "./routes/assignments";
import { errorHandler } from "./middleware/errorHandler";

const SQLiteStore = ConnectSqlite3(session);

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

app.use(
  session({
    store: new SQLiteStore({ db: "sessions.db", dir: "./prisma" }) as session.Store,
    secret: process.env.SESSION_SECRET ?? "dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/weeks", weekRoutes);
app.use("/api", availabilityRoutes);
app.use("/api", requirementRoutes);
app.use("/api", shiftCountRoutes);
app.use("/api", assignmentRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
