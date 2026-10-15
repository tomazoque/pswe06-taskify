import { describe, expect, it } from "vitest";
import { createTaskSchema } from "../../src/features/tasks/schemas";
import { TaskStatus } from "../../src/features/tasks/types";

// HU-01: a missing or incorrectly typed date must not become 1970-01-01.
// Exercise the real production schema without Appwrite or network mocks.
const validTask = {
  name: "Preparar avance 1",
  status: TaskStatus.TODO,
  workspaceId: "workspace-a",
  projectId: "project-a",
  assigneeId: "member-a",
};

describe("HU-01 task dueDate validation before production fix", () => {
  it.each([
    ["ISO string", "2026-10-20T12:00:00.000Z"],
    ["Date object from form", new Date("2026-10-20T12:00:00.000Z")],
  ])("accepts a valid %s", (_label, dueDate) => {
    const result = createTaskSchema.safeParse({ ...validTask, dueDate });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dueDate.toISOString()).toBe("2026-10-20T12:00:00.000Z");
    }
  });

  it.each([
    ["empty string", ""],
    ["invalid text", "not-a-date"],
    ["missing value", undefined],
    ["null", null],
    ["false", false],
    ["true", true],
    ["numeric zero", 0],
    ["plain object", {}],
  ])("rejects %s", (_label, dueDate) => {
    const result = createTaskSchema.safeParse({ ...validTask, dueDate });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "dueDate")).toBe(true);
    }
  });
});
