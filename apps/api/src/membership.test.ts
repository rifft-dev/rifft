import assert from "node:assert/strict";
import test from "node:test";
import { buildRemoveMemberInput, getPermissionsForRoles } from "./membership.js";

test("getPermissionsForRoles grants read-only access to plain members", () => {
  assert.deepEqual(getPermissionsForRoles("member", "member"), {
    can_manage_billing: false,
    can_rotate_api_keys: false,
    can_update_settings: false,
  });
});

test("getPermissionsForRoles grants settings and api key access to project owners", () => {
  assert.deepEqual(getPermissionsForRoles("owner", "member"), {
    can_manage_billing: false,
    can_rotate_api_keys: true,
    can_update_settings: true,
  });
});

test("getPermissionsForRoles grants billing and workspace control to account owners", () => {
  assert.deepEqual(getPermissionsForRoles("member", "owner"), {
    can_manage_billing: true,
    can_rotate_api_keys: true,
    can_update_settings: true,
  });
});

test("buildRemoveMemberInput preserves project, remover, and target ids in order", () => {
  assert.deepEqual(buildRemoveMemberInput("project-123", "owner-456", "member-789"), {
    projectId: "project-123",
    removerUserId: "owner-456",
    targetUserId: "member-789",
  });
});
