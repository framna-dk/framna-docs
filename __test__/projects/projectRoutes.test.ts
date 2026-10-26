import { jest } from "@jest/globals"
import { getProjectPath, parseProjectRoute, getProjectSelectionFromPath, ProjectNavigator } from "@/features/projects/domain"

const versions = [{
  id: "feature/api", name: "feature/api", isDefault: true,
  specifications: [{ id: "services/user/openapi.yaml", name: "User API", url: "/spec" }]
}]
const legacy = { id: "acme-aurora", owner: "acme", ownerUrl: "https://github.com/acme", name: "aurora", displayName: "Aurora API", path: "/acme/aurora", versions }
const monorepo = { ...legacy, id: "repo:acme/aurora", path: "/repos/acme/aurora" }

test.each([legacy, monorepo])("It selects the correct project for $path with a slash-containing branch and nested spec", project => {
  const path = `${project.path}/feature/api/services%2Fuser%2Fopenapi.yaml`
  const parsed = parseProjectRoute(path)
  expect(parsed.owner).toBe("acme")
  expect(parsed.name).toBe("aurora")
  expect(parsed.exactRepository).toBe(project === monorepo)
  const selection = getProjectSelectionFromPath({ projects: [legacy, monorepo], path })
  expect(selection.project!.id).toBe(project.id)
  expect(selection.version!.id).toBe("feature/api")
  expect(selection.specification!.id).toBe("services/user/openapi.yaml")
})

test.each([legacy, monorepo])("It keeps $path when switching branches or specs", project => {
  const push = jest.fn<(path: string) => void>()
  const replace = jest.fn<(path: string) => void>()
  const navigator = new ProjectNavigator({ router: { push, replace }, pathnameReader: { pathname: project.path } })
  navigator.navigateToVersion(project, "feature/api", "User API")
  expect(push).toHaveBeenLastCalledWith(`${project.path}/feature/api/services%2Fuser%2Fopenapi.yaml`)
  navigator.navigate(project.owner, project.name, "feature/api", "services/orders/openapi.yaml", getProjectPath(project))
  expect(push).toHaveBeenLastCalledWith(`${project.path}/feature/api/services%2Forders%2Fopenapi.yaml`)
  navigator.navigateIfNeeded({ projectOwner: project.owner, projectName: project.name, projectPath: project.path, versionId: "feature/api", specificationId: "services/user/openapi.yaml" })
  expect(replace).toHaveBeenLastCalledWith(`${project.path}/feature/api/services%2Fuser%2Fopenapi.yaml`)
})

test("It keeps the old base path for project fixtures without an explicit path", () => {
  expect(getProjectPath({ owner: "acme", name: "aurora" })).toBe("/acme/aurora")
})

test("It does not reinterpret a prefixed route as a same-named legacy project", () => {
  expect(getProjectSelectionFromPath({ projects: [legacy], path: monorepo.path }).project).toBeUndefined()
  expect(getProjectSelectionFromPath({ projects: [monorepo], path: legacy.path }).project).toBeUndefined()
})

test("It selects and navigates a suffixed repository owned by the reserved namespace", () => {
  const project = { ...legacy, owner: "repos", id: "repos-aurora", path: "/repos/repos/aurora-openapi" }
  const path = `${project.path}/feature/api/services%2Fuser%2Fopenapi.yaml`
  expect(parseProjectRoute(path)).toMatchObject({ owner: "repos", name: "aurora-openapi", exactRepository: true })
  const selection = getProjectSelectionFromPath({ projects: [project], path })
  expect(selection.project).toBe(project)
  expect(selection.version!.id).toBe("feature/api")
  expect(selection.specification!.id).toBe("services/user/openapi.yaml")
  const push = jest.fn<(path: string) => void>()
  new ProjectNavigator({ router: { push, replace: () => {} }, pathnameReader: { pathname: project.path } })
    .navigateToVersion(project, "feature/api", "User API")
  expect(push).toHaveBeenCalledWith(path)
})

test("It does not guess legacy-owner semantics for old reserved-prefix links", () => {
  const parsed = parseProjectRoute("/repos/aurora")
  expect(parsed.exactRepository).toBe(true)
  expect(parsed.name).toBeUndefined()
  expect(parseProjectRoute("/repos/aurora/main/api.yaml")).toMatchObject({ owner: "aurora", name: "main", exactRepository: true })
})
