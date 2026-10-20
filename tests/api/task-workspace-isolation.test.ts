import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context, Next } from "hono";

const state = vi.hoisted(() => ({
  actor: "admin-a",
  databases: {
    getDocument: vi.fn(),
    listDocuments: vi.fn(),
    createDocument: vi.fn(),
    updateDocument: vi.fn(),
  },
}));

vi.mock("@/config", () => ({
  DATABASE_ID: "test-db",
  MEMBERS_ID: "members",
  PROJECTS_ID: "projects",
  TASKS_ID: "tasks",
}));
vi.mock("@/lib/appwrite", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/session-middleware", () => ({
  sessionMiddleware: async (c: Context, next: Next) => {
    c.set("user", { $id: state.actor });
    c.set("databases", state.databases);
    await next();
  },
}));

import app from "../../src/features/tasks/server/route";
import { TaskStatus } from "../../src/features/tasks/types";

const validTask = {
  name: "Tarea de prueba",
  status: TaskStatus.TODO,
  workspaceId: "workspace-a",
  projectId: "project-a",
  dueDate: "2026-10-20T12:00:00.000Z",
  assigneeId: "member-a",
};

beforeEach(() => {
  vi.clearAllMocks();
  state.actor = "admin-a";

  state.databases.listDocuments.mockImplementation(async (_db, collection, queries: string[]) => {
    const equalQueries = queries
      .map((query) => JSON.parse(query))
      .filter((query) => query.method === "equal");

    if (collection === "members") {
      const matchesWorkspace = equalQueries.some(
        (query) => query.attribute === "workspaceId" && query.values.includes("workspace-a")
      );
      const matchesActor = equalQueries.some(
        (query) => query.attribute === "userId" && query.values.includes(state.actor)
      );

      return matchesWorkspace && matchesActor
        ? {
            total: 1,
            documents: [{
              $id: "member-a",
              userId: state.actor,
              workspaceId: "workspace-a",
              role: state.actor === "member-a" ? "MEMBER" : "ADMIN",
            }],
          }
        : { total: 0, documents: [] };
    }

    return { total: 0, documents: [] };
  });
  state.databases.getDocument.mockImplementation(async (_db, collection, id) => {
    if (collection === "tasks") {
      return {
        $id: id,
        name: "Tarea existente",
        status: TaskStatus.TODO,
        workspaceId: "workspace-a",
        projectId: "project-a",
        dueDate: "2026-10-20T12:00:00.000Z",
        assigneeId: "member-a",
      };
    }

    if (collection === "projects") {
      return { $id: id, workspaceId: id === "project-b" ? "workspace-b" : "workspace-a" };
    }

    if (collection === "members") {
      return { $id: id, workspaceId: id === "member-b" ? "workspace-b" : "workspace-a" };
    }

    throw new Error(`Unexpected collection: ${collection}`);
  });
  state.databases.createDocument.mockResolvedValue({ $id: "new-task" });
  state.databases.updateDocument.mockResolvedValue({ $id: "task-a" });
});

describe("HU-02 and HU-03 task workspace isolation", () => {
  it("rejects an invalid due date with HTTP 400 before writing", async () => {
    const response = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validTask, dueDate: null }),
    });

    expect(response.status).toBe(400);
    expect(state.databases.createDocument).not.toHaveBeenCalled();
  });

  it("allows creating a task when project and assignee belong to the workspace", async () => {
    const response = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validTask),
    });

    expect(response.status).toBe(200);
    expect(state.databases.createDocument).toHaveBeenCalled();
  });

  it("allows updating a task when project and assignee belong to the workspace", async () => {
    const response = await app.request("/task-a", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "project-a", assigneeId: "member-a" }),
    });

    expect(response.status).toBe(200);
    expect(state.databases.updateDocument).toHaveBeenCalled();
  });

  it("allows updating only the project within the workspace", async () => {
    const response = await app.request("/task-a", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "project-a" }),
    });

    expect(response.status).toBe(200);
    expect(state.databases.updateDocument).toHaveBeenCalled();
  });

  it("allows updating only the assignee within the workspace", async () => {
    const response = await app.request("/task-a", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeId: "member-a" }),
    });

    expect(response.status).toBe(200);
    expect(state.databases.updateDocument).toHaveBeenCalled();
  });

  it("rejects creating a task with a project from another workspace", async () => {
    const response = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validTask, projectId: "project-b" }),
    });

    expect(response.status).toBe(401);
    expect(state.databases.createDocument).not.toHaveBeenCalled();
  });

  it("rejects updating a task with a project from another workspace", async () => {
    const response = await app.request("/task-a", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "project-b" }),
    });

    expect(response.status).toBe(401);
    expect(state.databases.updateDocument).not.toHaveBeenCalled();
  });

  it("rejects creating a task assigned to a member from another workspace", async () => {
    const response = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validTask, assigneeId: "member-b" }),
    });

    expect(response.status).toBe(401);
    expect(state.databases.createDocument).not.toHaveBeenCalled();
  });

  it("rejects updating a task assigned to a member from another workspace", async () => {
    const response = await app.request("/task-a", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeId: "member-b" }),
    });

    expect(response.status).toBe(401);
    expect(state.databases.updateDocument).not.toHaveBeenCalled();
  });

  it("rejects creating a task when project and assignee are from another workspace", async () => {
    const response = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validTask, projectId: "project-b", assigneeId: "member-b" }),
    });

    expect(response.status).toBe(401);
    expect(state.databases.createDocument).not.toHaveBeenCalled();
  });

  it("rejects updating a task when project and assignee are from another workspace", async () => {
    const response = await app.request("/task-a", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "project-b", assigneeId: "member-b" }),
    });

    expect(response.status).toBe(401);
    expect(state.databases.updateDocument).not.toHaveBeenCalled();
  });

  it("allows a regular member to create a task with same-workspace relationships", async () => {
    state.actor = "member-a";

    const response = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validTask),
    });

    expect(response.status).toBe(200);
    expect(state.databases.createDocument).toHaveBeenCalled();
  });

  it("allows a regular member to update same-workspace relationships", async () => {
    state.actor = "member-a";

    const response = await app.request("/task-a", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "project-a", assigneeId: "member-a" }),
    });

    expect(response.status).toBe(200);
    expect(state.databases.updateDocument).toHaveBeenCalled();
  });
});
