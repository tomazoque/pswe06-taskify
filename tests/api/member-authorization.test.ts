import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context, Next } from "hono";

const state = vi.hoisted(() => ({
  actor: "admin-a", members: [] as Array<Record<string, string>>,
  databases: { getDocument: vi.fn(), listDocuments: vi.fn(), updateDocument: vi.fn(), deleteDocument: vi.fn() },
}));
vi.mock("@/config", () => ({ DATABASE_ID: "test-db", MEMBERS_ID: "members" }));
vi.mock("@/lib/appwrite", () => ({ createAdminClient: vi.fn() }));
// Substitute the authenticated session and persistence only. The Hono routes,
// Zod validator, getMember and authorization decisions remain production code.
vi.mock("@/lib/session-middleware", () => ({
  sessionMiddleware: async (c: Context, next: Next) => {
    c.set("user", { $id: state.actor });
    c.set("databases", state.databases);
    await next();
  },
}));
import app from "../../src/features/members/server/route";

beforeEach(() => {
  vi.clearAllMocks();
  state.actor = "admin-a";
  state.members = [
    { $id: "ma", userId: "admin-a", workspaceId: "A", role: "ADMIN" },
    { $id: "ma2", userId: "admin-a2", workspaceId: "A", role: "ADMIN" },
    { $id: "mu", userId: "member-a", workspaceId: "A", role: "MEMBER" },
    { $id: "mb", userId: "admin-b", workspaceId: "B", role: "ADMIN" },
  ];
  state.databases.getDocument.mockImplementation(async (_db, _collection, id) => {
    const member = state.members.find(m => m.$id === id);
    if (!member) throw new Error("Test member not found");
    return { ...member };
  });
  state.databases.listDocuments.mockImplementation(async (_db, _collection, queries: string[]) => {
    const documents = state.members.filter(member => queries.every(serialized => {
      const query = JSON.parse(serialized);
      if (query.method !== "equal") throw new Error("Unsupported test query");
      return query.values.includes(member[query.attribute]);
    }));
    return { total: documents.length, documents };
  });
  state.databases.updateDocument.mockResolvedValue({});
  state.databases.deleteDocument.mockResolvedValue({});
});
const patch = (id: string, role: string) => app.request(`/${id}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }),
});
const onlyOneAdmin = () => { state.members = state.members.filter(m => m.$id !== "ma2"); };

describe("HU-04 member role and workspace authorization", () => {
  it("allows an admin to promote a member in the same workspace", async () => {
    expect((await patch("mu", "ADMIN")).status).toBe(200);
    expect(state.databases.updateDocument).toHaveBeenCalledWith("test-db", "members", "mu", { role: "ADMIN" });
  });
  it("blocks a regular member from promoting themselves", async () => {
    state.actor = "member-a";
    expect((await patch("mu", "ADMIN")).status).toBe(401);
    expect(state.databases.updateDocument).not.toHaveBeenCalled();
  });
  it("blocks an admin of A from changing a member of B", async () => {
    expect((await patch("mb", "MEMBER")).status).toBe(401);
    expect(state.databases.updateDocument).not.toHaveBeenCalled();
  });
  it("rejects a role outside the Zod enum before writing", async () => {
    expect((await patch("mu", "OWNER")).status).toBe(400);
    expect(state.databases.updateDocument).not.toHaveBeenCalled();
  });
  it("prevents demoting the last admin", async () => {
    onlyOneAdmin();
    expect((await patch("ma", "MEMBER")).status).toBe(401);
    expect(state.databases.updateDocument).not.toHaveBeenCalled();
  });
  it("allows the sole admin to promote another member", async () => {
    onlyOneAdmin();
    expect((await patch("mu", "ADMIN")).status).toBe(200);
    expect(state.databases.updateDocument).toHaveBeenCalledWith("test-db", "members", "mu", { role: "ADMIN" });
  });
  it("blocks deletion of a member in another workspace", async () => {
    expect((await app.request("/mb", { method: "DELETE" })).status).toBe(401);
    expect(state.databases.deleteDocument).not.toHaveBeenCalled();
  });
  it("prevents deleting the last admin while other members remain", async () => {
    onlyOneAdmin();
    expect((await app.request("/ma", { method: "DELETE" })).status).toBe(401);
    expect(state.databases.deleteDocument).not.toHaveBeenCalled();
  });
});
