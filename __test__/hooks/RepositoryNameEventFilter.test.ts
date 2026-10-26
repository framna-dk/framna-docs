import { RepositoryNameEventFilter } from "@/features/hooks/domain"

test("It includes repositories without the suffix so configuration opt-in can be checked", async () => {
  const sut = new RepositoryNameEventFilter({
    allowlist: [],
    disallowlist: []
  })
  const result = sut.includeEvent({
    repositoryOwner: "acme",
    repositoryName: "foo"
  })
  expect(result).toBeTruthy()
})

test("It includes repository when both allowlist and disallowlist are empty", async () => {
  const sut = new RepositoryNameEventFilter({
    allowlist: [],
    disallowlist: []
  })
  const result = sut.includeEvent({
    repositoryOwner: "acme",
    repositoryName: "foo-openapi"
  })
  expect(result).toBeTruthy()
})

test("It does not include repository when it is not on the allowlist", async () => {
  const sut = new RepositoryNameEventFilter({
    allowlist: ["acme/example-openapi"],
    disallowlist: []
  })
  const result = sut.includeEvent({
    repositoryOwner: "acme",
    repositoryName: "foo"
  })
  expect(result).toBeFalsy()
})

test("It include repository when it is on the disallowlist", async () => {
  const sut = new RepositoryNameEventFilter({
    allowlist: [],
    disallowlist: ["acme/example-openapi"]
  })
  const result = sut.includeEvent({
    repositoryOwner: "acme",
    repositoryName: "example-openapi"
  })
  expect(result).toBeFalsy()
})

test("It ensures that the disallowlist takes precedence over the allowlist", async () => {
  const sut = new RepositoryNameEventFilter({
    allowlist: ["acme/example-openapi"],
    disallowlist: ["acme/example-openapi"]
  })
  const result = sut.includeEvent({
    repositoryOwner: "acme",
    repositoryName: "example-openapi"
  })
  expect(result).toBeFalsy()
})

test("It requires owner to be included when matching against the allowlist", async () => {
  const sut = new RepositoryNameEventFilter({
    allowlist: ["example-openapi"],
    disallowlist: []
  })
  const result = sut.includeEvent({
    repositoryOwner: "acme",
    repositoryName: "example-openapi"
  })
  // The repository is not allowed because the repository in the allowlist does not include the owner.
  expect(result).toBeFalsy()
})

test("It requires owner to be included when matching against the disallowlist", async () => {
  const sut = new RepositoryNameEventFilter({
    allowlist: [],
    disallowlist: ["example-openapi"]
  })
  const result = sut.includeEvent({
    repositoryOwner: "acme",
    repositoryName: "example-openapi"
  })
  // The repository is allowed because the repository in the disallowlist does not include the owner.
  expect(result).toBeTruthy()
})