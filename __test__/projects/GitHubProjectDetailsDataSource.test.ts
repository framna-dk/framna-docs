import { jest } from "@jest/globals"
import { GitHubProjectDetailsDataSource } from "@/features/projects/data"
import { IGitHubGraphQLClient } from "@/features/projects/domain"
import { IEncryptionService } from "@/features/encrypt/EncryptionService"
import { IRemoteConfigEncoder } from "@/features/projects/domain/RemoteConfigEncoder"

const createMockGraphQLClient = (response: unknown = null): IGitHubGraphQLClient => ({
  graphql: jest.fn<() => Promise<unknown>>().mockResolvedValue(response)
})

const createMockEncryptionService = (): IEncryptionService => ({
  encrypt: jest.fn<(data: string) => string>().mockImplementation(data => `encrypted:${data}`),
  decrypt: jest.fn<(data: string) => string>().mockImplementation(data => data.replace("encrypted:", ""))
})

const createMockRemoteConfigEncoder = (): IRemoteConfigEncoder => ({
  encode: jest.fn<() => string>().mockReturnValue("encoded-config"),
  decode: jest.fn()
})

const createSut = (overrides: {
  graphQlClient?: IGitHubGraphQLClient
  repositoryNameSuffix?: string
  projectConfigurationFilename?: string
  encryptionService?: IEncryptionService
  remoteConfigEncoder?: IRemoteConfigEncoder
} = {}) => {
  return new GitHubProjectDetailsDataSource({
    graphQlClient: overrides.graphQlClient || createMockGraphQLClient(),
    repositoryNameSuffix: overrides.repositoryNameSuffix || "-openapi",
    projectConfigurationFilename: overrides.projectConfigurationFilename || ".framna-docs.yml",
    encryptionService: overrides.encryptionService || createMockEncryptionService(),
    remoteConfigEncoder: overrides.remoteConfigEncoder || createMockRemoteConfigEncoder()
  })
}

const createRepositoryResponse = (overrides: {
  name?: string
  defaultBranchRef?: { name: string; target: { oid: string } }
  configYml?: { text: string } | null
  branches?: { name: string; target: { oid: string; tree: { entries: { name: string }[] } } }[]
  tags?: { name: string; target: { oid: string; tree: { entries: { name: string }[] } } }[]
  pullRequests?: { number: number; headRefName: string; baseRefName: string; baseRefOid: string; files?: { nodes: { path: string }[] } }[]
} = {}) => ({
  repository: {
    name: overrides.name || "my-project-openapi",
    defaultBranchRef: overrides.defaultBranchRef || { name: "main", target: { oid: "abc123" } },
    configYml: overrides.configYml === null ? undefined : (overrides.configYml || undefined),
    configYaml: undefined,
    branches: {
      edges: (overrides.branches || [{ name: "main", target: { oid: "abc123", tree: { entries: [{ name: "api.yml" }] } } }])
        .map(node => ({ node }))
    },
    tags: {
      edges: (overrides.tags || []).map(node => ({ node }))
    },
    pullRequests: {
      edges: (overrides.pullRequests || []).map(node => ({ node }))
    }
  }
})

describe("GitHubProjectDetailsDataSource", () => {
  describe("getProjectDetails", () => {
    test("It returns null when repository is not found", async () => {
      const graphQlClient = createMockGraphQLClient({ repository: null })
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      expect(result).toBeNull()
    })

    test("It returns null when the GraphQL client throws a not-found error", async () => {
      const graphQlClient: IGitHubGraphQLClient = {
        graphql: jest.fn<() => Promise<unknown>>().mockRejectedValue(
          Object.assign(new Error("Could not resolve to a Repository"), { type: "NOT_FOUND" })
        )
      }
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "nonexistent")

      expect(result).toBeNull()
    })

    test("It throws when the GraphQL client throws a non-not-found error", async () => {
      const networkError = new Error("Network failure")
      const graphQlClient: IGitHubGraphQLClient = {
        graphql: jest.fn<() => Promise<unknown>>().mockRejectedValue(networkError)
      }
      const sut = createSut({ graphQlClient })

      await expect(sut.getProjectDetails("acme", "my-project")).rejects.toThrow("Network failure")
    })

    test("It returns project with basic info", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse())
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      expect(result).not.toBeNull()
      expect(result!.id).toBe("acme-my-project")
      expect(result!.name).toBe("my-project")
      expect(result!.owner).toBe("acme")
      expect(result!.ownerUrl).toBe("https://github.com/acme")
      expect(result!.url).toBe("https://github.com/acme/my-project-openapi")
    })

    test("It uses display name from config", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        configYml: { text: "name: My Awesome API" }
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      expect(result!.displayName).toBe("My Awesome API")
    })

    test("It uses project name when config has no name", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        configYml: null
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      expect(result!.displayName).toBe("my-project")
    })

    test("It generates image URL from config", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        configYml: { text: "image: logo.png" },
        defaultBranchRef: { name: "main", target: { oid: "abc123" } }
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      expect(result!.imageURL).toBe("/api/blob/acme/my-project-openapi/logo.png?ref=abc123")
    })

    test("It appends suffix to repo name if not present", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse())
      const sut = createSut({ graphQlClient })

      await sut.getProjectDetails("acme", "my-project")

      expect(graphQlClient.graphql).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: { owner: "acme", name: "my-project-openapi" }
        })
      )
    })

    test("It does not double-append suffix if already present", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse())
      const sut = createSut({ graphQlClient })

      await sut.getProjectDetails("acme", "my-project-openapi")

      expect(graphQlClient.graphql).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: { owner: "acme", name: "my-project-openapi" }
        })
      )
    })
  })

  describe("versions", () => {
    test("It creates versions from branches", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        branches: [
          { name: "main", target: { oid: "abc123", tree: { entries: [{ name: "api.yml" }] } } },
          { name: "develop", target: { oid: "def456", tree: { entries: [{ name: "api.yml" }] } } }
        ]
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      expect(result!.versions).toHaveLength(2)
      expect(result!.versions.map(v => v.name)).toContain("main")
      expect(result!.versions.map(v => v.name)).toContain("develop")
    })

    test("It creates versions from tags", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        branches: [{ name: "main", target: { oid: "abc123", tree: { entries: [{ name: "api.yml" }] } } }],
        tags: [{ name: "v1.0.0", target: { oid: "tag123", tree: { entries: [{ name: "api.yml" }] } } }]
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      expect(result!.versions.map(v => v.name)).toContain("v1.0.0")
    })

    test("It marks default branch as default", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        defaultBranchRef: { name: "main", target: { oid: "abc123" } },
        branches: [
          { name: "main", target: { oid: "abc123", tree: { entries: [{ name: "api.yml" }] } } },
          { name: "develop", target: { oid: "def456", tree: { entries: [{ name: "api.yml" }] } } }
        ]
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      const mainVersion = result!.versions.find(v => v.name === "main")
      const developVersion = result!.versions.find(v => v.name === "develop")
      expect(mainVersion!.isDefault).toBe(true)
      expect(developVersion!.isDefault).toBe(false)
    })

    test("It sorts versions with default branch first", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        defaultBranchRef: { name: "main", target: { oid: "abc123" } },
        branches: [
          { name: "zebra", target: { oid: "z123", tree: { entries: [{ name: "api.yml" }] } } },
          { name: "main", target: { oid: "abc123", tree: { entries: [{ name: "api.yml" }] } } },
          { name: "alpha", target: { oid: "a123", tree: { entries: [{ name: "api.yml" }] } } }
        ]
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      expect(result!.versions[0].name).toBe("main")
    })

    test("It filters out versions without specifications", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        branches: [
          { name: "main", target: { oid: "abc123", tree: { entries: [{ name: "api.yml" }] } } },
          { name: "empty", target: { oid: "def456", tree: { entries: [{ name: "README.md" }] } } }
        ]
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      expect(result!.versions).toHaveLength(1)
      expect(result!.versions[0].name).toBe("main")
    })
  })

  describe("specifications", () => {
    test("It creates specifications from YAML files", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        branches: [{
          name: "main",
          target: {
            oid: "abc123",
            tree: { entries: [{ name: "api.yml" }, { name: "other.yaml" }] }
          }
        }]
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      expect(result!.versions[0].specifications).toHaveLength(2)
      expect(result!.versions[0].specifications.map(s => s.name)).toContain("api.yml")
      expect(result!.versions[0].specifications.map(s => s.name)).toContain("other.yaml")
    })

    test("It ignores non-YAML files", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        branches: [{
          name: "main",
          target: {
            oid: "abc123",
            tree: { entries: [{ name: "api.yml" }, { name: "README.md" }, { name: "script.js" }] }
          }
        }]
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      expect(result!.versions[0].specifications).toHaveLength(1)
      expect(result!.versions[0].specifications[0].name).toBe("api.yml")
    })

    test("It ignores hidden files (starting with dot)", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        branches: [{
          name: "main",
          target: {
            oid: "abc123",
            tree: { entries: [{ name: "api.yml" }, { name: ".framna-docs.yml" }] }
          }
        }]
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      expect(result!.versions[0].specifications).toHaveLength(1)
      expect(result!.versions[0].specifications[0].name).toBe("api.yml")
    })

    test("It generates correct URLs for specifications", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        branches: [{
          name: "feature/test",
          target: { oid: "abc123", tree: { entries: [{ name: "api.yml" }] } }
        }]
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      const spec = result!.versions[0].specifications[0]
      expect(spec.url).toBe("/api/blob/acme/my-project-openapi/api.yml?ref=abc123")
      expect(spec.editURL).toBe("https://github.com/acme/my-project-openapi/edit/feature/test/api.yml")
    })

    test("It sorts specifications alphabetically", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        branches: [{
          name: "main",
          target: {
            oid: "abc123",
            tree: { entries: [{ name: "zebra.yml" }, { name: "alpha.yml" }, { name: "middle.yml" }] }
          }
        }]
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      expect(result!.versions[0].specifications.map(s => s.name)).toEqual(["alpha.yml", "middle.yml", "zebra.yml"])
    })
  })

  describe("pull requests", () => {
    test("It adds diff URL for changed files in PRs", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        branches: [{
          name: "feature-branch",
          target: { oid: "feature123", tree: { entries: [{ name: "api.yml" }] } }
        }],
        pullRequests: [{
          number: 42,
          headRefName: "feature-branch",
          baseRefName: "main",
          baseRefOid: "base123",
          files: { nodes: [{ path: "api.yml" }] }
        }]
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      const spec = result!.versions.find(v => v.name === "feature-branch")!.specifications[0]
      expect(spec.diffURL).toBe("/api/diff/acme/my-project-openapi/api.yml?baseRefOid=base123&to=feature123")
      expect(spec.diffBaseBranch).toBe("main")
      expect(spec.diffPrUrl).toBe("https://github.com/acme/my-project-openapi/pull/42")
    })

    test("It does not add diff URL for unchanged files", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        branches: [{
          name: "feature-branch",
          target: { oid: "feature123", tree: { entries: [{ name: "api.yml" }, { name: "other.yml" }] } }
        }],
        pullRequests: [{
          number: 42,
          headRefName: "feature-branch",
          baseRefName: "main",
          baseRefOid: "base123",
          files: { nodes: [{ path: "api.yml" }] }
        }]
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      const specs = result!.versions.find(v => v.name === "feature-branch")!.specifications
      const changedSpec = specs.find(s => s.name === "api.yml")
      const unchangedSpec = specs.find(s => s.name === "other.yml")

      expect(changedSpec!.diffURL).toBeDefined()
      expect(unchangedSpec!.diffURL).toBeUndefined()
    })
  })

  describe("remote versions", () => {
    test("It creates versions from remote config", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        configYml: {
          text: `
remoteVersions:
  - name: External API
    specifications:
      - name: External Spec
        url: https://example.com/spec.yml
`
        },
        branches: []
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      expect(result!.versions).toHaveLength(1)
      expect(result!.versions[0].name).toBe("External API")
      expect(result!.versions[0].specifications).toHaveLength(1)
      expect(result!.versions[0].specifications[0].name).toBe("External Spec")
    })

    test("It generates remote spec URLs through encoder", async () => {
      const remoteConfigEncoder = createMockRemoteConfigEncoder()
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        configYml: {
          text: `
remoteVersions:
  - name: External
    specifications:
      - name: Spec
        url: https://example.com/spec.yml
`
        },
        branches: []
      }))
      const sut = createSut({ graphQlClient, remoteConfigEncoder })

      const result = await sut.getProjectDetails("acme", "my-project")

      expect(result!.versions[0].specifications[0].url).toBe("/api/remotes/encoded-config")
    })
  })

  describe("default specification", () => {
    test("It sets isDefault on the correct specification based on config", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        configYml: { text: "defaultSpecificationName: bar-service.yml" },
        branches: [{
          name: "main",
          target: {
            oid: "abc123",
            tree: { entries: [
              { name: "foo-service.yml" },
              { name: "bar-service.yml" },
              { name: "baz-service.yml" }
            ]}
          }
        }]
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      const specs = result!.versions[0].specifications
      expect(specs.find(s => s.name === "bar-service.yml")!.isDefault).toBe(true)
      expect(specs.find(s => s.name === "foo-service.yml")!.isDefault).toBe(false)
      expect(specs.find(s => s.name === "baz-service.yml")!.isDefault).toBe(false)
    })

    test("It sets isDefault to false for all specifications when no default is configured", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        configYml: null,
        branches: [{
          name: "main",
          target: {
            oid: "abc123",
            tree: { entries: [{ name: "api.yml" }, { name: "other.yml" }] }
          }
        }]
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      expect(result!.versions[0].specifications.every(s => s.isDefault === false)).toBe(true)
    })

    test("It silently ignores defaultSpecificationName if no matching spec is found", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        configYml: { text: "defaultSpecificationName: non-existent.yml" },
        branches: [{
          name: "main",
          target: {
            oid: "abc123",
            tree: { entries: [{ name: "api.yml" }] }
          }
        }]
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      expect(result!.versions[0].specifications.every(s => s.isDefault === false)).toBe(true)
    })
  })
})
