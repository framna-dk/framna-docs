import ProjectListState from "@/features/projects/domain/ProjectListState"
import type ProjectSummary from "@/features/projects/domain/ProjectSummary"

const project: ProjectSummary = { id: "repo:acme/aurora", owner: "acme", name: "aurora", displayName: "Aurora", path: "/repos/acme/aurora", ownerUrl: "https://github.com/acme" }

test("It ignores an older response after a newer response confirms a registration", () => {
  const state = new ProjectListState()
  const older = state.beginRequest()
  state.addProject(project)
  const newer = state.beginRequest()
  expect(state.applyResponse(newer, [project])).toEqual([project])
  expect(state.applyResponse(older, [])).toBeUndefined()
  // The old response also cannot clear additions made after the newer response.
  const added = { ...project, name: "borealis", path: "/repos/acme/borealis", displayName: "Borealis" }
  expect(state.addProject(added)).toEqual([project, added])
  expect(state.applyResponse(older, [])).toBeUndefined()
})

test("It preserves a registration made during a request, but later authoritative refreshes may remove it", () => {
  const state = new ProjectListState()
  const inFlight = state.beginRequest()
  state.addProject(project)
  expect(state.applyResponse(inFlight, [])).toEqual([project])
  expect(state.applyResponse(state.beginRequest(), [])).toEqual([])
})

test("It keeps projects whose old hyphen-joined IDs collide", () => {
  const state = new ProjectListState()
  const first = { ...project, id: "acme-team-aurora", owner: "acme-team", name: "aurora", path: "/acme-team/aurora" }
  const second = { ...project, id: first.id, owner: "acme", name: "team-aurora", path: "/acme/team-aurora" }
  expect(state.applyResponse(state.beginRequest(), [first, second])).toHaveLength(2)
  const updated = { ...second, displayName: "Updated API" }
  const projects = state.addProject(updated)
  expect(projects).toHaveLength(2)
  expect(projects).toContain(first)
  expect(projects).toContain(updated)
})

test("It distinguishes a legacy project and a configured repository with the same owner/name", () => {
  const state = new ProjectListState()
  const legacy = { ...project, path: "/acme/aurora" }
  expect(state.applyResponse(state.beginRequest(), [legacy, project])).toHaveLength(2)
  expect(state.addProject({ ...project, displayName: "Updated repository" })).toHaveLength(2)
})

test("It deduplicates equivalent repository paths regardless of casing", () => {
  const state = new ProjectListState()
  state.addProject(project)
  const canonical = { ...project, path: "/repos/Acme/Aurora" }
  expect(state.addProject(canonical)).toEqual([canonical])
})

test("It marks only the newest request as current, including when a newer refresh fails", () => {
  const state = new ProjectListState()
  const older = state.beginRequest()
  const newer = state.beginRequest()
  expect(state.isCurrent(older)).toBe(false)
  expect(state.isCurrent(newer)).toBe(true)
  expect(state.applyResponse(older, [project])).toBeUndefined()
})
