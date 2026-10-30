import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

const mocks = vi.hoisted(() => {
  const whereSelect = vi.fn();
  const selectFrom = vi.fn(() => ({ where: whereSelect }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const updateWhere = vi.fn();
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const deleteWhere = vi.fn();
  const remove = vi.fn(() => ({ where: deleteWhere }));
  const transaction = vi.fn();
  const verifyPassword = vi.fn();
  const hashPassword = vi.fn();
  const eq = vi.fn(() => ({}));
  const and = vi.fn(() => ({}));
  const sql = vi.fn(() => ({}));

  return {
    and,
    db: { delete: remove, select, transaction, update },
    deleteWhere,
    eq,
    hashPassword,
    remove,
    select,
    sql,
    transaction,
    update,
    updateWhere,
    verifyPassword,
    whereSelect,
  };
});

vi.mock("@workspace/db", () => ({
  db: mocks.db,
  passwordResetTokensTable: { userId: "passwordResetTokens.userId" },
  sessionsTable: { sess: "sessions.sess", sid: "sessions.sid" },
  usersTable: { id: "users.id", passwordHash: "users.passwordHash" },
}));

vi.mock("drizzle-orm", () => ({
  and: mocks.and,
  eq: mocks.eq,
  gt: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  sql: mocks.sql,
}));

vi.mock("../lib/auth", () => ({
  clearSession: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  getSessionId: vi.fn(() => "active-session"),
  hashPassword: mocks.hashPassword,
  SESSION_COOKIE: "sid",
  SESSION_TTL: 60_000,
  STEP_UP_TTL: 60_000,
  updateSession: vi.fn(),
  verifyPassword: mocks.verifyPassword,
}));

vi.mock("../lib/resendMail", () => ({ sendEmail: vi.fn() }));
vi.mock("../lib/appOrigins", () => ({ isNativeAppOrigin: vi.fn(() => false) }));

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.user = {
    id: "user-1",
    email: "person@example.com",
    firstName: null,
    lastName: null,
    profileImageUrl: null,
  };
  req.isAuthenticated = (() => true) as Request["isAuthenticated"];
  next();
});

const authRouter = (await import("./auth")).default;
app.use("/api", authRouter);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.whereSelect.mockResolvedValue([{ passwordHash: "current-hash" }]);
  mocks.verifyPassword.mockResolvedValue(true);
  mocks.hashPassword.mockResolvedValue("new-hash");
  mocks.updateWhere.mockResolvedValue(undefined);
  mocks.deleteWhere.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(
    async (callback: (transaction: typeof mocks.db) => Promise<void>) =>
      callback(mocks.db),
  );
});

describe("POST /api/auth/change-password", () => {
  it("rejects passwords shorter than eight characters", async () => {
    const response = await request(app).post("/api/auth/change-password").send({
      currentPassword: "old-password",
      newPassword: "short",
      confirmPassword: "short",
    });

    expect(response.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("rejects confirmation mismatches", async () => {
    const response = await request(app).post("/api/auth/change-password").send({
      currentPassword: "old-password",
      newPassword: "new-password",
      confirmPassword: "different-password",
    });

    expect(response.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("does not change the password if the current password is incorrect", async () => {
    mocks.verifyPassword.mockResolvedValue(false);

    const response = await request(app).post("/api/auth/change-password").send({
      currentPassword: "wrong-password",
      newPassword: "new-password",
      confirmPassword: "new-password",
    });

    expect(response.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("updates the password, retains the active session, and invalidates other sessions and reset tokens", async () => {
    const response = await request(app).post("/api/auth/change-password").send({
      currentPassword: "old-password",
      newPassword: "new-password",
      confirmPassword: "new-password",
    });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Password changed successfully");
    expect(mocks.hashPassword).toHaveBeenCalledWith("new-password");
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledTimes(2);
  });
});
