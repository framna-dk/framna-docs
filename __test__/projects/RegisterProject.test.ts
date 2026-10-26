import { jest } from "@jest/globals"
import RegisterProject, { ProjectRegistrationError } from "@/features/new-project/domain/RegisterProject"
import parseGitHubRepository from "@/features/new-project/domain/parseGitHubRepository"
import createRegisterProjectHandler from "@/features/new-project/data/createRegisterProjectHandler"
import type { ProjectSummary } from "@/features/projects/domain"

const project: ProjectSummary = {
  id: "repo:acme/aurora", name: "aurora", path: "/repos/acme/aurora", displayName: "Aurora API", owner: "acme",
  ownerUrl: "https://github.com/acme"
}

test.each(["acme/aurora", " https://github.com/acme/aurora/ ", "https://github.com/acme/aurora.git", "github.com/acme/aurora"])("It accepts a repository reference: %s", input => {
  expect(parseGitHubRepository(input)).toEqual({ owner: "acme", name: "aurora" })
})

test.each(["", "aurora", "acme/aurora/tree/main", "https://example.com/acme/aurora", "https://github.com.evil.test/acme/aurora", "https://user:password@github.com/acme/aurora", "http://github.com/acme/aurora", "acme/.."])("It rejects an invalid repository reference: %s", input => {
  expect(parseGitHubRepository(input)).toBeUndefined()
})

function registration(candidate: { repository: { owner: string; name: string }; project: ProjectSummary } | undefined = {
  repository: { owner: "Acme", name: "Aurora" }, project
}) {
  const getProjectCandidate = jest.fn<() => Promise<typeof candidate>>().mockResolvedValue(candidate)
  const add = jest.fn<(repository: { owner: string; name: string }) => Promise<void>>().mockResolvedValue()
  return { service: new RegisterProject({ candidates: { getProjectCandidate }, repository: { add }, repositoryNameSuffix: "-openapi" }), add, getProjectCandidate }
}

test("It registers the canonical repository only after checking access and configuration", async () => {
  const { service, add, getProjectCandidate } = registration()
  expect(await service.register("https://github.com/acme/aurora")).toEqual(project)
  expect(getProjectCandidate).toHaveBeenCalledWith({ owner: "acme", name: "aurora" })
  expect(add).toHaveBeenCalledWith({ owner: "Acme", name: "Aurora" })
})

test("It does not query or save malformed input", async () => {
  const { service, add, getProjectCandidate } = registration()
  await expect(service.register("invalid")).rejects.toMatchObject({ status: 400 })
  expect(getProjectCandidate).not.toHaveBeenCalled()
  expect(add).not.toHaveBeenCalled()
})

test.each(["acme/aurora-openapi", "https://github.com/acme/aurora-openapi"])("It rejects fast-tracking a repository with the discovery suffix: %s", async input => {
  const { service, add, getProjectCandidate } = registration({ repository: { owner: "acme", name: "aurora-openapi" }, project })
  await expect(service.register(input)).rejects.toMatchObject({ status: 400, message: expect.stringContaining("discovered automatically") })
  expect(getProjectCandidate).toHaveBeenCalledTimes(1)
  expect(add).not.toHaveBeenCalled()
})

test.each(["aurora-OPENAPI", "aurora-openapi"])("It accepts a canonical uppercase suffix that automatic discovery does not match (input: %s)", async name => {
  const canonical = { owner: "acme", name: "aurora-OPENAPI" }
  const { service, add } = registration({ repository: canonical, project: { ...project, name: canonical.name, path: "/repos/acme/aurora-OPENAPI" } })
  await service.register(`https://github.com/acme/${name}`)
  expect(add).toHaveBeenCalledWith(canonical)
})

test("It rejects a case-varied input when GitHub's canonical repository has the automatic suffix", async () => {
  const { service, add } = registration({ repository: { owner: "acme", name: "aurora-openapi" }, project })
  await expect(service.register("acme/aurora-OPENAPI")).rejects.toMatchObject({ status: 400 })
  expect(add).not.toHaveBeenCalled()
})

test("It does not save inaccessible or unconfigured repositories", async () => {
  const { service, add, getProjectCandidate } = registration()
  getProjectCandidate.mockResolvedValueOnce(undefined)
  await expect(service.register("acme/aurora")).rejects.toMatchObject({ status: 404 })
  expect(add).not.toHaveBeenCalled()
})

test("It does not save repositories with invalid configuration", async () => {
  const { service, add } = registration({ repository: { owner: "acme", name: "aurora" }, project: { ...project, configError: "Invalid specification path" } })
  await expect(service.register("acme/aurora")).rejects.toMatchObject({ status: 400 })
  expect(add).not.toHaveBeenCalled()
})

function handler(authenticated = true) {
  const register = jest.fn<(input: string) => Promise<ProjectSummary>>().mockResolvedValue(project)
  const post = createRegisterProjectHandler({
    session: { getIsAuthenticated: async () => authenticated }, registration: { register }, publicUrl: "https://example.com"
  })
  return { post, register }
}

function request(body = JSON.stringify({ repository: "acme/aurora" }), headers = { "content-type": "application/json" }) {
  return new Request("https://example.com/api/projects", { method: "POST", headers, body })
}

test("It requires authentication before onboarding a repository", async () => {
  const { post, register } = handler(false)
  expect((await post(request())).status).toBe(401)
  expect(register).not.toHaveBeenCalled()
})

test("It rejects cross-origin submissions", async () => {
  const { post, register } = handler()
  expect((await post(request(undefined, { "content-type": "application/json", ...{ origin: "https://other.example.com" } }))).status).toBe(403)
  expect(register).not.toHaveBeenCalled()
})

test("It accepts the configured public origin when the server request uses an internal bind address", async () => {
  const { post, register } = handler()
  const response = await post(new Request("http://0.0.0.0:3000/api/projects", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://example.com" },
    body: JSON.stringify({ repository: "acme/aurora" })
  }))
  expect(response.status).toBe(200)
  expect(register).toHaveBeenCalledWith("acme/aurora")
})

test("It does not trust the bind address or forwarded headers as the public origin", async () => {
  const { post, register } = handler()
  const response = await post(new Request("http://0.0.0.0:3000/api/projects", {
    method: "POST", headers: { "content-type": "application/json", origin: "http://0.0.0.0:3000", "x-forwarded-host": "example.com", "x-forwarded-proto": "https" },
    body: JSON.stringify({ repository: "acme/aurora" })
  }))
  expect(response.status).toBe(403)
  expect(register).not.toHaveBeenCalled()
})

test.each(["{", "null", "{}", '{"repository":42}'])("It rejects malformed registration data: %s", async body => {
  const { post, register } = handler()
  expect((await post(request(body))).status).toBe(400)
  expect(register).not.toHaveBeenCalled()
})

test("It returns the registered project for the sidebar and navigation", async () => {
  const { post, register } = handler()
  const response = await post(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ project })
  expect(register).toHaveBeenCalledWith("acme/aurora")
})

test("It reports validation errors from repository checks", async () => {
  const { post, register } = handler()
  register.mockRejectedValueOnce(new ProjectRegistrationError("Repository is unavailable", 404))
  const response = await post(request())
  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({ error: "Repository is unavailable" })
})
