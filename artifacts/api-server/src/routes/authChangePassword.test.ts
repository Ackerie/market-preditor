import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

const mocks = vi.hoisted(() => {
  const whereSelect = vi.fn();
  const selectFrom = vi.fn(() => ({ where: whereSelect }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const insertValues = vi.fn();
  const insert = vi.fn(() => ({ values: insertValues }));
  const updateWhere = vi.fn();
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const deleteWhere = vi.fn();
  const remove = vi.fn(() => ({ where: deleteWhere }));
  const transaction = vi.fn();
  const createSession = vi.fn(() => "mock-session");
  const verifyPassword = vi.fn();
  const hashPassword = vi.fn();
  const eq = vi.fn(() => ({}));
  const and = vi.fn(() => ({}));
  const sql = vi.fn(() => ({}));

  return {
    and,
    db: { delete: remove, insert, select, transaction, update },
    createSession,
    deleteWhere,
    eq,
    hashPassword,
    insert,
    insertValues,
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
  usersTable: {
    id: "users.id",
    passwordHash: "users.passwordHash",
    isAdmin: "users.isAdmin",
    paidAccessEnabled: "users.paidAccessEnabled",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: mocks.and,
  eq: mocks.eq,
  gt: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  sql: mocks.sql,
}));

vi.mock("../lib/auth", () => ({
  anyAdminUserExists: vi.fn(() => false),
  clearSession: vi.fn(),
  createSession: mocks.createSession,
  ensureBootstrapAdmin: vi.fn(() => false),
  getAdminCredentials: vi.fn(() => null),
  getAdminTwoFactorSecret: vi.fn(() => null),
  getSession: vi.fn(),
  getSessionId: vi.fn(() => "active-session"),
  hashPassword: mocks.hashPassword,
  isAdminCredentials: vi.fn(() => false),
  isAdminIpAllowed: vi.fn(() => true),
  recordAdminAudit: vi.fn(),
  SESSION_COOKIE: "sid",
  SESSION_TTL: 60_000,
  STEP_UP_TTL: 60_000,
  updateSession: vi.fn(),
  verifyPassword: mocks.verifyPassword,
  verifyTotp: vi.fn(() => true),
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
    isAdmin: false,
    paidAccessEnabled: false,
  };
  req.isAuthenticated = (() => true) as Request["isAuthenticated"];
  next();
});

const authModule = await import("../lib/auth");
const authRouter = (await import("./auth")).default;
app.use("/api", authRouter);

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
  vi.mocked(authModule.anyAdminUserExists).mockResolvedValue(false);
  vi.mocked(authModule.ensureBootstrapAdmin).mockResolvedValue(false);
  vi.mocked(authModule.getAdminCredentials).mockReturnValue(null);
  vi.mocked(authModule.isAdminCredentials).mockReturnValue(false);
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

describe("POST /api/auth/login", () => {
  it("accepts the configured administrator account when admin mode is enabled", async () => {
    vi.mocked(authModule.ensureBootstrapAdmin).mockResolvedValue(true);
    vi.mocked(authModule.anyAdminUserExists).mockResolvedValue(true);
    mocks.whereSelect.mockResolvedValue([
      {
        id: "admin-user",
        email: "owner@example.com",
        passwordHash: "admin-hash",
        isAdmin: true,
      },
    ]);
    mocks.verifyPassword.mockResolvedValue(true);

    const response = await request(app).post("/api/auth/login").send({
      email: "owner@example.com",
      password: "SuperSecurePassword123!",
    });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      email: "owner@example.com",
      isAdmin: true,
    });
  });

  it("allows normal user logins even when an admin account exists", async () => {
    vi.mocked(authModule.ensureBootstrapAdmin).mockResolvedValue(true);
    vi.mocked(authModule.anyAdminUserExists).mockResolvedValue(true);
    mocks.whereSelect.mockResolvedValue([
      {
        id: "user-2",
        email: "someone-else@example.com",
        passwordHash: "user-hash",
        isAdmin: false,
      },
    ]);
    mocks.verifyPassword.mockResolvedValue(true);

    const response = await request(app).post("/api/auth/login").send({
      email: "someone-else@example.com",
      password: "not-the-admin-password",
    });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      email: "someone-else@example.com",
      isAdmin: false,
    });
  });
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
