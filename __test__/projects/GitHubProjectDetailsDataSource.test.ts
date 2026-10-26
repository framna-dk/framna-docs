import { jest } from "@jest/globals"
import type { IGitHubClient } from "@/common"
import { GitHubProjectDetailsDataSource } from "@/features/projects/data"
import { IGitHubGraphQLClient } from "@/features/projects/domain"
import { IEncryptionService } from "@/features/encrypt/EncryptionService"
import { IRemoteConfigEncoder } from "@/features/projects/domain/RemoteConfigEncoder"

const createSpecExistenceResponse = (
  refs: { name: string; oid: string }[],
  specs: { path: string }[],
  existingPaths: string[]
) => {
  const result: Record<string, unknown> = { repository: {} }
  refs.forEach((ref, ri) => {
    specs.forEach((spec, si) => {
      const alias = `r${ri}s${si}`
      const exists = existingPaths.includes(spec.path)
      ;(result.repository as Record<string, unknown>)[alias] = exists ? { oid: "abc" } : null
    })
    void ref
  })
  return result
}

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
  commitComparer?: Pick<IGitHubClient, "compareCommitsWithBasehead">
  repositoryNameSuffix?: string
  projectConfigurationFilename?: string
  encryptionService?: IEncryptionService
  remoteConfigEncoder?: IRemoteConfigEncoder
} = {}) => {
  return new GitHubProjectDetailsDataSource({
    graphQlClient: overrides.graphQlClient || createMockGraphQLClient(),
    commitComparer: overrides.commitComparer || { compareCommitsWithBasehead: async () => ({ mergeBaseSha: "merge123" }) },
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
  pullRequests?: { number: number; headRefName: string; headRefOid?: string; headRepository?: { nameWithOwner: string } | null; baseRefName: string; baseRefOid: string; files?: { nodes: { path: string }[] } }[]
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
      edges: (overrides.pullRequests || []).map(node => ({ node: {
        headRepository: { nameWithOwner: `acme/${overrides.name || "my-project-openapi"}` },
        headRefOid: overrides.branches?.find(branch => branch.name === node.headRefName)?.target.oid ?? "abc123",
        ...node
      } }))
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

    test("It degrades to default behavior when the config is malformed", async () => {
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => {})
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        configYml: { text: "name: Broken Project\nimage:\n  - not\n  - a-string" }
      }))
      const sut = createSut({ graphQlClient })

      const result = await sut.getProjectDetails("acme", "my-project")

      expect(result).not.toBeNull()
      expect(result!.displayName).toBe("my-project")
      expect(result!.imageURL).toBeUndefined()
      expect(result!.versions).toHaveLength(1)
      expect(result!.versions[0].specifications.map(s => s.name)).toEqual(["api.yml"])
      expect(consoleError).toHaveBeenCalled()
      consoleError.mockRestore()
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

    test("It resolves a full repository name verbatim in exact mode", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse())
      const sut = createSut({ graphQlClient })

      await sut.getProjectDetails("acme", "my-project-openapi", { exactRepository: true })

      expect(graphQlClient.graphql).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: { owner: "acme", name: "my-project-openapi" }
        })
      )
    })

    test("It appends the suffix to legacy project names even if the project name itself ends with it", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({ name: "aurora-openapi-openapi" }))
      const result = await createSut({ graphQlClient }).getProjectDetails("acme", "aurora-openapi")
      expect(graphQlClient.graphql).toHaveBeenCalledWith(expect.objectContaining({ variables: { owner: "acme", name: "aurora-openapi-openapi" } }))
      expect(result!.path).toBe("/acme/aurora-openapi")
    })

    test("It fetches an exact repository route without looking for a suffixed counterpart", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        name: "aurora", configYml: { text: "name: Aurora API" }
      }))
      const result = await createSut({ graphQlClient }).getProjectDetails("acme", "aurora", { exactRepository: true })
      expect(result!.path).toBe("/repos/acme/aurora")
      expect(result!.id).toBe("repo:acme/aurora")
      expect(graphQlClient.graphql).toHaveBeenCalledTimes(1)
      expect(graphQlClient.graphql).toHaveBeenCalledWith(expect.objectContaining({ variables: { owner: "acme", name: "aurora" } }))
    })

    test("It does not fall back from a missing legacy project to a bare repository", async () => {
      const graphql = jest.fn<IGitHubGraphQLClient["graphql"]>().mockResolvedValue({ repository: null })
      expect(await createSut({ graphQlClient: { graphql } }).getProjectDetails("acme", "aurora")).toBeNull()
      expect(graphql).toHaveBeenCalledTimes(1)
      expect(graphql).toHaveBeenCalledWith(expect.objectContaining({ variables: { owner: "acme", name: "aurora-openapi" } }))
    })

    test("It returns null for an exact repository without a config file", async () => {
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({ name: "aurora" }))
      expect(await createSut({ graphQlClient }).getProjectDetails("acme", "aurora", { exactRepository: true })).toBeNull()
    })

    test("It does not fall back to a suffixed repository when the exact repository is missing", async () => {
      const graphql = jest.fn<IGitHubGraphQLClient["graphql"]>().mockRejectedValue(Object.assign(new Error("Not found"), { type: "NOT_FOUND" }))
      expect(await createSut({ graphQlClient: { graphql } }).getProjectDetails("acme", "aurora", { exactRepository: true })).toBeNull()
      expect(graphql).toHaveBeenCalledTimes(1)
      expect(graphql).toHaveBeenCalledWith(expect.objectContaining({ variables: { owner: "acme", name: "aurora" } }))
    })

    test("It serves colliding legacy and exact repository routes from their own repositories", async () => {
      const graphql = jest.fn<IGitHubGraphQLClient["graphql"]>().mockImplementation(async request =>
        createRepositoryResponse({ name: request.variables!.name, configYml: { text: "name: Aurora API" } })
      )
      const sut = createSut({ graphQlClient: { graphql } })
      const legacy = await sut.getProjectDetails("acme", "aurora")
      const monorepo = await sut.getProjectDetails("acme", "aurora", { exactRepository: true })
      expect(legacy!.path).toBe("/acme/aurora")
      expect(monorepo!.path).toBe("/repos/acme/aurora")
      expect(legacy!.id).not.toBe(monorepo!.id)
      expect(legacy!.versions[0].specifications[0].url).toContain("/api/blob/acme/aurora-openapi/")
      expect(monorepo!.versions[0].specifications[0].url).toContain("/api/blob/acme/aurora/")
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

    describe("config-specified specifications", () => {
      test("It uses config specifications instead of root tree entries when specifications are defined", async () => {
        const phase1Response = createRepositoryResponse({
          configYml: {
            text: `
specifications:
  - path: services/user/openapi.yaml
    name: User API
`
          },
          branches: [{
            name: "main",
            target: { oid: "abc123", tree: { entries: [{ name: "not-a-spec.yml" }] } }
          }]
        })

        const phase2Response = createSpecExistenceResponse(
          [{ name: "main", oid: "abc123" }],
          [{ path: "services/user/openapi.yaml" }],
          ["services/user/openapi.yaml"]
        )

        const graphQlClient = createMockGraphQLClient(phase1Response)
        ;(graphQlClient.graphql as jest.Mock).mockResolvedValueOnce(phase1Response)
          .mockResolvedValueOnce(phase2Response)
        const sut = createSut({ graphQlClient })

        const result = await sut.getProjectDetails("acme", "my-project")

        expect(result!.versions[0].specifications).toHaveLength(1)
        expect(result!.versions[0].specifications[0].name).toBe("User API")
        expect(result!.versions[0].specifications[0].id).toBe("services/user/openapi.yaml")
      })

      test("It falls back to full path as name when no name is specified", async () => {
        const phase1Response = createRepositoryResponse({
          configYml: {
            text: `
specifications:
  - path: services/user/openapi.yaml
`
          },
          branches: [{ name: "main", target: { oid: "abc123", tree: { entries: [] } } }]
        })
        const phase2Response = createSpecExistenceResponse(
          [{ name: "main", oid: "abc123" }],
          [{ path: "services/user/openapi.yaml" }],
          ["services/user/openapi.yaml"]
        )

        const graphQlClient: IGitHubGraphQLClient = {
          graphql: jest.fn<() => Promise<unknown>>()
            .mockResolvedValueOnce(phase1Response)
            .mockResolvedValueOnce(phase2Response)
        }
        const sut = createSut({ graphQlClient })

        const result = await sut.getProjectDetails("acme", "my-project")

        expect(result!.versions[0].specifications[0].name).toBe("services/user/openapi.yaml")
      })

      test("It excludes specs that don't exist in a given ref", async () => {
        const phase1Response = createRepositoryResponse({
          configYml: {
            text: `
specifications:
  - path: services/user/openapi.yaml
  - path: services/orders/openapi.yaml
`
          },
          branches: [{ name: "main", target: { oid: "abc123", tree: { entries: [] } } }]
        })
        const phase2Response = createSpecExistenceResponse(
          [{ name: "main", oid: "abc123" }],
          [{ path: "services/user/openapi.yaml" }, { path: "services/orders/openapi.yaml" }],
          ["services/user/openapi.yaml"]
        )

        const graphQlClient: IGitHubGraphQLClient = {
          graphql: jest.fn<() => Promise<unknown>>()
            .mockResolvedValueOnce(phase1Response)
            .mockResolvedValueOnce(phase2Response)
        }
        const sut = createSut({ graphQlClient })

        const result = await sut.getProjectDetails("acme", "my-project")

        expect(result!.versions[0].specifications).toHaveLength(1)
        expect(result!.versions[0].specifications[0].id).toBe("services/user/openapi.yaml")
      })

      test("It generates correct URLs for config-specified spec paths", async () => {
        const phase1Response = createRepositoryResponse({
          configYml: { text: "specifications:\n  - path: services/user/openapi.yaml" },
          branches: [{ name: "main", target: { oid: "abc123", tree: { entries: [] } } }]
        })
        const phase2Response = createSpecExistenceResponse(
          [{ name: "main", oid: "abc123" }],
          [{ path: "services/user/openapi.yaml" }],
          ["services/user/openapi.yaml"]
        )

        const graphQlClient: IGitHubGraphQLClient = {
          graphql: jest.fn<() => Promise<unknown>>()
            .mockResolvedValueOnce(phase1Response)
            .mockResolvedValueOnce(phase2Response)
        }
        const sut = createSut({ graphQlClient })

        const result = await sut.getProjectDetails("acme", "my-project")
        const spec = result!.versions[0].specifications[0]

        expect(spec.url).toBe("/api/blob/acme/my-project-openapi/services%2Fuser%2Fopenapi.yaml?ref=abc123")
        expect(spec.editURL).toBe("https://github.com/acme/my-project-openapi/edit/main/services%2Fuser%2Fopenapi.yaml")
      })

      test("It generates diff URL for changed config-specified spec paths", async () => {
        const phase1Response = createRepositoryResponse({
          configYml: { text: "specifications:\n  - path: services/user/openapi.yaml" },
          branches: [{ name: "feature", target: { oid: "feat123", tree: { entries: [] } } }],
          pullRequests: [{
            number: 7,
            headRefName: "feature",
            baseRefName: "main",
            baseRefOid: "base123",
            files: { nodes: [{ path: "services/user/openapi.yaml" }] }
          }]
        })
        const phase2Response = createSpecExistenceResponse(
          [{ name: "feature", oid: "feat123" }],
          [{ path: "services/user/openapi.yaml" }],
          ["services/user/openapi.yaml"]
        )

        const graphQlClient: IGitHubGraphQLClient = {
          graphql: jest.fn<() => Promise<unknown>>()
            .mockResolvedValueOnce(phase1Response)
            .mockResolvedValueOnce(phase2Response)
            .mockResolvedValueOnce({ repository: { r0s0: { oid: "old" }, r1s0: { oid: "new" } } })
        }
        const sut = createSut({ graphQlClient })

        const result = await sut.getProjectDetails("acme", "my-project")
        const spec = result!.versions[0].specifications[0]

        expect(spec.diffURL).toBe("/api/diff/acme/my-project-openapi/services%2Fuser%2Fopenapi.yaml?baseRefOid=base123&to=feat123")
        expect(spec.diffBaseBranch).toBe("main")
      })

      test("It does not make a second GraphQL call when no specifications are in config", async () => {
        const graphQlClient = createMockGraphQLClient(createRepositoryResponse())
        const sut = createSut({ graphQlClient })

        await sut.getProjectDetails("acme", "my-project")

        expect(graphQlClient.graphql).toHaveBeenCalledTimes(1)
      })

      test.each([
        { name: "modified", base: { oid: "before" }, head: { oid: "after" }, changed: true },
        { name: "added", base: null, head: { oid: "after" }, changed: true },
        { name: "unchanged", base: { oid: "same" }, head: { oid: "same" }, changed: false }
      ])("It checks the configured $name spec independently of the PR file list", async ({ base, head, changed }) => {
        const specPath = "services/user/openapi.yaml"
        const phase1 = createRepositoryResponse({
          name: "aurora",
          configYml: { text: `specifications:\n  - path: ${specPath}\n  - path: services/orders/api.yaml` },
          branches: [{ name: "feature", target: { oid: "head123", tree: { entries: [] } } }],
          pullRequests: [{
            number: 42, headRefName: "feature", baseRefName: "main", baseRefOid: "base-tip",
            files: { nodes: Array.from({ length: 100 }, (_, i) => ({ path: `src/file-${i}.ts` })) }
          }]
        })
        const graphql = jest.fn<IGitHubGraphQLClient["graphql"]>()
          .mockResolvedValueOnce(phase1)
          .mockResolvedValueOnce({ repository: { r0s0: head, r0s1: { oid: "orders" } } })
          .mockResolvedValueOnce({ repository: {
            r0s0: base, r0s1: { oid: "orders" },
            r1s0: head, r1s1: { oid: "orders" }
          } })
        const compareCommitsWithBasehead = jest.fn<IGitHubClient["compareCommitsWithBasehead"]>()
          .mockResolvedValue({ mergeBaseSha: "merge-base" })
        const sut = createSut({ graphQlClient: { graphql }, commitComparer: { compareCommitsWithBasehead } })

        const project = await sut.getProjectDetails("acme", "aurora")
        const [orders, user] = project!.versions[0].specifications

        expect(Boolean(user.diffURL)).toBe(changed)
        expect(orders.diffURL).toBeUndefined()
        expect(compareCommitsWithBasehead).toHaveBeenCalledWith({
          repositoryOwner: "acme", repositoryName: "aurora", baseRefOid: "base-tip", headRefOid: "head123"
        })
        const query = graphql.mock.calls[2][0].query
        expect(query).toContain(`merge-base:${specPath}`)
        expect(query).toContain(`head123:${specPath}`)
        expect(query).not.toContain("base-tip:")
        expect(query).not.toContain("src/file-")
      })
    })
  })

  describe("pull requests", () => {
    test.each([
      { kind: "fork", headRepository: { nameWithOwner: "contributor/aurora" }, headRefOid: "feature123" },
      { kind: "stale local head", headRepository: { nameWithOwner: "acme/aurora" }, headRefOid: "older-commit" },
      { kind: "deleted head repository", headRepository: null, headRefOid: "feature123" }
    ])("It does not associate a $kind PR with a same-named local branch", async metadata => {
      const path = "services/user/openapi.yaml"
      const graphql = jest.fn<IGitHubGraphQLClient["graphql"]>()
        .mockResolvedValueOnce(createRepositoryResponse({
          name: "aurora", configYml: { text: `specifications:\n  - path: ${path}` },
          branches: [{ name: "feature", target: { oid: "feature123", tree: { entries: [] } } }],
          pullRequests: [{
            number: 7, headRefName: "feature", baseRefName: "main", baseRefOid: "base123",
            headRefOid: metadata.headRefOid, headRepository: metadata.headRepository,
            files: { nodes: [{ path: "README.md" }] }
          }]
        }))
        .mockResolvedValueOnce({ repository: { r0s0: { oid: "changed-spec" } } })
      const compareCommitsWithBasehead = jest.fn<IGitHubClient["compareCommitsWithBasehead"]>()
      const result = await createSut({ graphQlClient: { graphql }, commitComparer: { compareCommitsWithBasehead } })
        .getProjectDetails("acme", "aurora", { exactRepository: true })
      expect(result!.versions[0].specifications[0].diffURL).toBeUndefined()
      expect(result!.versions[0].specifications[0].diffPrUrl).toBeUndefined()
      expect(compareCommitsWithBasehead).not.toHaveBeenCalled()
      expect(graphql).toHaveBeenCalledTimes(2)
      expect(graphql.mock.calls[0][0].query).toContain("headRepository { nameWithOwner }")
      expect(graphql.mock.calls[0][0].query).toContain("headRefOid")
    })

    test.each([false, true])("It preserves the matching local PR when a same-named fork PR is present (fork first: %s)", async forkFirst => {
      const local = { number: 42, headRefName: "feature", headRefOid: "feature123", headRepository: { nameWithOwner: "ACME/my-project-openapi" }, baseRefName: "main", baseRefOid: "base123", files: { nodes: [{ path: "api.yml" }] } }
      const fork = { ...local, number: 7, headRepository: { nameWithOwner: "contributor/my-project-openapi" } }
      const graphQlClient = createMockGraphQLClient(createRepositoryResponse({
        branches: [{ name: "feature", target: { oid: "feature123", tree: { entries: [{ name: "api.yml" }] } } }],
        pullRequests: forkFirst ? [fork, local] : [local, fork]
      }))
      const result = await createSut({ graphQlClient }).getProjectDetails("acme", "my-project")
      expect(result!.versions[0].specifications[0].diffPrUrl).toBe("https://github.com/acme/my-project-openapi/pull/42")
    })

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
