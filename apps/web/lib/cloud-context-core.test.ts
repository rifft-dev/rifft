import assert from "node:assert/strict";
import test from "node:test";
import {
  getCurrentProjectCookieMutation,
  resolveActiveProjectFromProjects,
} from "./cloud-context-core.js";

test("resolveActiveProjectFromProjects clears active project for unauthenticated users", () => {
  const resolution = resolveActiveProjectFromProjects({
    preferredProjectId: "project-stale",
    projects: null,
    state: "unauthenticated",
  });

  assert.deepEqual(resolution, {
    projectId: null,
    preferredProjectId: "project-stale",
    repaired: false,
    hasCloudProjects: false,
  });
});

test("resolveActiveProjectFromProjects preserves the preferred project during cloud outages", () => {
  const resolution = resolveActiveProjectFromProjects({
    preferredProjectId: "project-2",
    projects: null,
    state: "unavailable",
  });

  assert.deepEqual(resolution, {
    projectId: "project-2",
    preferredProjectId: "project-2",
    repaired: false,
    hasCloudProjects: false,
  });
});

test("resolveActiveProjectFromProjects falls back to default during cloud outages without a preferred project", () => {
  const resolution = resolveActiveProjectFromProjects({
    preferredProjectId: null,
    projects: null,
    state: "unavailable",
  });

  assert.deepEqual(resolution, {
    projectId: "default",
    preferredProjectId: null,
    repaired: false,
    hasCloudProjects: false,
  });
});

test("resolveActiveProjectFromProjects keeps a valid preferred project", () => {
  const resolution = resolveActiveProjectFromProjects({
    preferredProjectId: "project-2",
    projects: [{ id: "project-1" }, { id: "project-2" }],
    state: "loaded",
  });

  assert.deepEqual(resolution, {
    projectId: "project-2",
    preferredProjectId: "project-2",
    repaired: false,
    hasCloudProjects: true,
  });
});

test("resolveActiveProjectFromProjects repairs stale project cookies when cloud projects load", () => {
  const resolution = resolveActiveProjectFromProjects({
    preferredProjectId: "project-stale",
    projects: [{ id: "project-1" }, { id: "project-2" }],
    state: "loaded",
  });

  assert.deepEqual(resolution, {
    projectId: "project-1",
    preferredProjectId: "project-stale",
    repaired: true,
    hasCloudProjects: true,
  });
});

test("resolveActiveProjectFromProjects clears project context when the user has no cloud workspaces", () => {
  const resolution = resolveActiveProjectFromProjects({
    preferredProjectId: "project-stale",
    projects: [],
    state: "loaded",
  });

  assert.deepEqual(resolution, {
    projectId: null,
    preferredProjectId: "project-stale",
    repaired: false,
    hasCloudProjects: false,
  });
});

test("getCurrentProjectCookieMutation repairs stale cookies when a new active project is chosen", () => {
  const mutation = getCurrentProjectCookieMutation({
    projectId: "project-1",
    preferredProjectId: "project-stale",
    repaired: true,
    hasCloudProjects: true,
  });

  assert.deepEqual(mutation, { kind: "set", projectId: "project-1" });
});

test("getCurrentProjectCookieMutation deletes stale cookies when no project remains", () => {
  const mutation = getCurrentProjectCookieMutation({
    projectId: null,
    preferredProjectId: "project-stale",
    repaired: false,
    hasCloudProjects: false,
  });

  assert.deepEqual(mutation, { kind: "delete" });
});

test("getCurrentProjectCookieMutation leaves cookies unchanged during temporary cloud outages", () => {
  const mutation = getCurrentProjectCookieMutation({
    projectId: "project-2",
    preferredProjectId: "project-2",
    repaired: false,
    hasCloudProjects: false,
  });

  assert.deepEqual(mutation, { kind: "none" });
});
