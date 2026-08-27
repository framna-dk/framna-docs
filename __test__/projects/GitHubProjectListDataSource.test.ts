import { jest } from "@jest/globals"
import { GitHubProjectListDataSource } from "@/features/projects/data"
import { IGitHubLoginDataSource, IGitHubGraphQLClient } from "@/features/projects/domain"
import IGitHubAccessibleRepositoriesDataSource, { AccessibleRepositoryRef } from "@/features/projects/domain/IGitHubAccessibleRepositoriesDataSource"
import IConfigFileScanRepository, { ConfigFileScan } from "@/features/projects/domain/IConfigFileScanRepository"

const createMockLoginsDataSource = (logins: string[] = []): IGitHubLoginDataSource => ({
  getLogins: jest.fn<() => Promise<string[]>>().mockResolvedValue(logins)
})

const createMockGraphQLClient = (responses: Record<string, unknown>[] = []): IGitHubGraphQLClient => {
  let callIndex = 0
  return {
    graphql: jest.fn<() => Promise<unknown>>().mockImplementation(() => {
      const response = responses[callIndex] || { search: { results: [], pageInfo: { hasNextPage: false } } }
      callIndex++
      return Promise.resolve(response)
    })
  }
}

const createMockAccessibleRepositoriesDataSource = (
  repos: AccessibleRepositoryRef[] = []
): IGitHubAccessibleRepositoriesDataSource => ({
  getAccessibleRepositories: jest.fn<() => Promise<AccessibleRepositoryRef[]>>()
    .mockResolvedValue(repos)
})

const createMockConfigFileScanRepository = (
  scan?: ConfigFileScan
): IConfigFileScanRepository => ({
  get: jest.fn<() => Promise<ConfigFileScan | undefined>>().mockResolvedValue(scan),
  set: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  delete: jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
})

const createSut = (overrides: {
  loginsDataSource?: IGitHubLoginDataSource
  graphQlClient?: IGitHubGraphQLClient
  accessibleRepositoriesDataSource?: IGitHubAccessibleRepositoriesDataSource
  configFileScanRepository?: IConfigFileScanRepository
  repositoryNameSuffix?: string
  projectConfigurationFilename?: string
  hiddenRepositories?: string[]
  emptyResponseRetryDelaysMs?: number[]
} = {}) => {
  return new GitHubProjectListDataSource({
    loginsDataSource: overrides.loginsDataSource || createMockLoginsDataSource(),
    graphQlClient: overrides.graphQlClient || createMockGraphQLClient(),
    accessibleRepositoriesDataSource: overrides.accessibleRepositoriesDataSource || createMockAccessibleRepositoriesDataSource(),
    configFileScanRepository: overrides.configFileScanRepository || createMockConfigFileScanRepository(),
    repositoryNameSuffix: overrides.repositoryNameSuffix || "-openapi",
    projectConfigurationFilename: overrides.projectConfigurationFilename || ".framna-docs.yml",
    hiddenRepositories: overrides.hiddenRepositories || [],
    emptyResponseRetryDelaysMs: overrides.emptyResponseRetryDelaysMs ?? [0]
  })
}

describe("GitHubProjectListDataSource", () => {
  test("It returns an empty list when no repositories are found", async () => {
    const graphQlClient = createMockGraphQLClient([
      { search: { results: [], pageInfo: { hasNextPage: false } } }
    ])
    const sut = createSut({ graphQlClient })

    const result = await sut.getProjectList()

    expect(result).toEqual([])
  })

  test("It returns project summaries for repositories with matching suffix", async () => {
    const graphQlClient = createMockGraphQLClient([
      {
        search: {
          results: [
            { name: "my-project-openapi", owner: { login: "acme" } }
          ],
          pageInfo: { hasNextPage: false }
        }
      }
    ])
    const sut = createSut({ graphQlClient })

    const result = await sut.getProjectList()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: "acme-my-project",
      name: "my-project",
      displayName: "my-project",
      owner: "acme",
      url: "https://github.com/acme/my-project-openapi",
      ownerUrl: "https://github.com/acme"
    })
  })

  test("It filters out repositories without matching suffix", async () => {
    const graphQlClient = createMockGraphQLClient([
      {
        search: {
          results: [
            { name: "my-project-openapi", owner: { login: "acme" } },
            { name: "other-repo", owner: { login: "acme" } }
          ],
          pageInfo: { hasNextPage: false }
        }
      }
    ])
    const sut = createSut({ graphQlClient })

    const result = await sut.getProjectList()

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("my-project")
  })

  test("It uses display name from config when available", async () => {
    const graphQlClient = createMockGraphQLClient([
      {
        search: {
          results: [
            {
              name: "my-project-openapi",
              owner: { login: "acme" },
              configYml: { text: "name: My Awesome Project" }
            }
          ],
          pageInfo: { hasNextPage: false }
        }
      }
    ])
    const sut = createSut({ graphQlClient })

    const result = await sut.getProjectList()

    expect(result[0].displayName).toBe("My Awesome Project")
  })

  test("It surfaces an invalid config as configError instead of failing the list", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {})
    const graphQlClient = createMockGraphQLClient([
      {
        search: {
          results: [
            {
              name: "legacy-project-openapi",
              owner: { login: "acme" },
              configYml: { text: "name: Legacy Project\nspecifications:\n  - name: v1\n    url: openapi.yml" }
            },
            {
              name: "healthy-project-openapi",
              owner: { login: "acme" },
              configYml: { text: "name: Healthy Project" }
            }
          ],
          pageInfo: { hasNextPage: false }
        }
      }
    ])
    const sut = createSut({ graphQlClient })

    const result = await sut.getProjectList()

    expect(result).toHaveLength(2)
    const legacy = result.find(p => p.name === "legacy-project")
    expect(legacy?.displayName).toBe("legacy-project")
    expect(legacy?.configError).toMatch(/specifications\.0\.path: \S/)
    const healthy = result.find(p => p.name === "healthy-project")
    expect(healthy?.displayName).toBe("Healthy Project")
    expect(healthy?.configError).toBeUndefined()
    consoleError.mockRestore()
  })

  test("It uses configYaml when configYml is not present", async () => {
    const graphQlClient = createMockGraphQLClient([
      {
        search: {
          results: [
            {
              name: "my-project-openapi",
              owner: { login: "acme" },
              configYaml: { text: "name: YAML Config Name" }
            }
          ],
          pageInfo: { hasNextPage: false }
        }
      }
    ])
    const sut = createSut({ graphQlClient })

    const result = await sut.getProjectList()

    expect(result[0].displayName).toBe("YAML Config Name")
  })

  test("It generates image URL from config", async () => {
    const graphQlClient = createMockGraphQLClient([
      {
        search: {
          results: [
            {
              name: "my-project-openapi",
              owner: { login: "acme" },
              configYml: { text: "image: logo.png" }
            }
          ],
          pageInfo: { hasNextPage: false }
        }
      }
    ])
    const sut = createSut({ graphQlClient })

    const result = await sut.getProjectList()

    expect(result[0].imageURL).toBe("/api/blob/acme/my-project-openapi/logo.png?ref=HEAD")
  })

  test("It encodes special characters in image path", async () => {
    const graphQlClient = createMockGraphQLClient([
      {
        search: {
          results: [
            {
              name: "my-project-openapi",
              owner: { login: "acme" },
              configYml: { text: "image: images/my logo.png" }
            }
          ],
          pageInfo: { hasNextPage: false }
        }
      }
    ])
    const sut = createSut({ graphQlClient })

    const result = await sut.getProjectList()

    expect(result[0].imageURL).toBe("/api/blob/acme/my-project-openapi/images%2Fmy%20logo.png?ref=HEAD")
  })

  test("It deduplicates repositories from multiple search queries", async () => {
    const loginsDataSource = createMockLoginsDataSource(["user1"])
    const graphQlClient = createMockGraphQLClient([
      // First query (private repos)
      {
        search: {
          results: [{ name: "shared-openapi", owner: { login: "acme" } }],
          pageInfo: { hasNextPage: false }
        }
      },
      // Second query (user1's public repos)
      {
        search: {
          results: [{ name: "shared-openapi", owner: { login: "acme" } }],
          pageInfo: { hasNextPage: false }
        }
      }
    ])
    const sut = createSut({ loginsDataSource, graphQlClient })

    const result = await sut.getProjectList()

    expect(result).toHaveLength(1)
  })

  test("It sorts projects alphabetically by name", async () => {
    const graphQlClient = createMockGraphQLClient([
      {
        search: {
          results: [
            { name: "zebra-openapi", owner: { login: "acme" } },
            { name: "alpha-openapi", owner: { login: "acme" } },
            { name: "middle-openapi", owner: { login: "acme" } }
          ],
          pageInfo: { hasNextPage: false }
        }
      }
    ])
    const sut = createSut({ graphQlClient })

    const result = await sut.getProjectList()

    expect(result.map(p => p.name)).toEqual(["alpha", "middle", "zebra"])
  })

  test("It handles pagination", async () => {
    const graphQlClient = createMockGraphQLClient([
      {
        search: {
          results: [{ name: "project-a-openapi", owner: { login: "acme" } }],
          pageInfo: { hasNextPage: true, endCursor: "cursor1" }
        }
      },
      {
        search: {
          results: [{ name: "project-b-openapi", owner: { login: "acme" } }],
          pageInfo: { hasNextPage: false }
        }
      }
    ])
    const sut = createSut({ graphQlClient })

    const result = await sut.getProjectList()

    expect(result).toHaveLength(2)
    expect(result.map(p => p.name)).toEqual(["project-a", "project-b"])
  })

  test("It handles empty search results gracefully", async () => {
    const graphQlClient = createMockGraphQLClient([
      { search: { results: null, pageInfo: { hasNextPage: false } } }
    ])
    const sut = createSut({ graphQlClient })

    const result = await sut.getProjectList()

    expect(result).toEqual([])
  })

  test("It strips .yml extension from config filename", async () => {
    const graphQlClient = createMockGraphQLClient([])
    const sut = createSut({
      graphQlClient,
      projectConfigurationFilename: ".framna-docs.yml"
    })

    await sut.getProjectList()

    expect(graphQlClient.graphql).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("HEAD:.framna-docs.yml")
      })
    )
  })

  test("It strips .yaml extension from config filename", async () => {
    const graphQlClient = createMockGraphQLClient([])
    const sut = createSut({
      graphQlClient,
      projectConfigurationFilename: ".framna-docs.yaml"
    })

    await sut.getProjectList()

    expect(graphQlClient.graphql).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("HEAD:.framna-docs.yml")
      })
    )
  })

  test("It filters out hidden repositories", async () => {
    const graphQlClient = createMockGraphQLClient([
      {
        search: {
          results: [
            { name: "visible-openapi", owner: { login: "acme" } },
            { name: "hidden-openapi", owner: { login: "acme" } },
            { name: "also-visible-openapi", owner: { login: "other" } }
          ],
          pageInfo: { hasNextPage: false }
        }
      }
    ])
    const sut = createSut({
      graphQlClient,
      hiddenRepositories: ["acme/hidden-openapi"]
    })

    const result = await sut.getProjectList()

    expect(result).toHaveLength(2)
    expect(result.map(p => p.name)).toEqual(["also-visible", "visible"])
  })

  test("It ignores invalid hidden repository entries", async () => {
    const graphQlClient = createMockGraphQLClient([
      {
        search: {
          results: [
            { name: "project-openapi", owner: { login: "acme" } }
          ],
          pageInfo: { hasNextPage: false }
        }
      }
    ])
    const sut = createSut({
      graphQlClient,
      hiddenRepositories: ["invalid-entry", "", "also-invalid"]
    })

    const result = await sut.getProjectList()

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("project")
  })

  describe("config-file discovery", () => {
    test("It includes repos containing the config file even without the suffix", async () => {
      const graphQlClient = createMockGraphQLClient([
        { search: { results: [], pageInfo: { hasNextPage: false } } },
        { search: { results: [], pageInfo: { hasNextPage: false } } },
        { repo_0: { name: "my-backend", owner: { login: "acme" }, configYml: { text: "" }, configYaml: null, defaultBranchRef: { target: { oid: "abc" } } } }
      ])
      const accessibleRepositoriesDataSource = createMockAccessibleRepositoriesDataSource([
        { owner: "acme", name: "my-backend", pushedAt: null }
      ])
      const sut = createSut({ loginsDataSource: createMockLoginsDataSource(["acme"]), graphQlClient, accessibleRepositoriesDataSource })

      const result = await sut.getProjectList()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("my-backend")
    })

    test("It drops accessible repos that do not contain the config file", async () => {
      const graphQlClient = createMockGraphQLClient([
        { search: { results: [], pageInfo: { hasNextPage: false } } },
        {
          repo_0: { name: "opted-in", owner: { login: "acme" }, configYml: null, configYaml: { text: "" }, defaultBranchRef: { target: { oid: "a" } } },
          repo_1: { name: "unrelated", owner: { login: "acme" }, configYml: null, configYaml: null, defaultBranchRef: { target: { oid: "b" } } }
        }
      ])
      const accessibleRepositoriesDataSource = createMockAccessibleRepositoriesDataSource([
        { owner: "acme", name: "opted-in", pushedAt: null },
        { owner: "acme", name: "unrelated", pushedAt: null }
      ])
      const sut = createSut({ graphQlClient, accessibleRepositoriesDataSource })

      const result = await sut.getProjectList()

      expect(result.map(p => p.name)).toEqual(["opted-in"])
    })

    test("It probes accessible repos in chunks and merges the results", async () => {
      const refs = Array.from({ length: 101 }, (_, i) => ({ owner: "acme", name: `repo-${i}`, pushedAt: null }))
      const chunkResponse = (names: string[]) => Object.fromEntries(
        names.map((name, i) => [
          `repo_${i}`,
          { name, owner: { login: "acme" }, configYml: { text: "" }, configYaml: null, defaultBranchRef: { target: { oid: "a" } } }
        ])
      )
      const graphQlClient = createMockGraphQLClient([
        { search: { results: [], pageInfo: { hasNextPage: false } } },
        chunkResponse(refs.slice(0, 50).map(ref => ref.name)),
        chunkResponse(refs.slice(50, 100).map(ref => ref.name)),
        chunkResponse(refs.slice(100).map(ref => ref.name))
      ])
      const accessibleRepositoriesDataSource = createMockAccessibleRepositoriesDataSource(refs)
      const sut = createSut({ graphQlClient, accessibleRepositoriesDataSource })

      const result = await sut.getProjectList()

      expect(result).toHaveLength(101)
      expect(graphQlClient.graphql).toHaveBeenCalledTimes(4)
    })

    test("It deduplicates repos found by both suffix search and config-file discovery", async () => {
      const graphQlClient = createMockGraphQLClient([
        {
          search: {
            results: [{ name: "service-openapi", owner: { login: "acme" } }],
            pageInfo: { hasNextPage: false }
          }
        },
        { repo_0: { name: "service-openapi", owner: { login: "acme" }, configYml: { text: "" }, configYaml: null, defaultBranchRef: { target: { oid: "abc" } } } }
      ])
      const accessibleRepositoriesDataSource = createMockAccessibleRepositoriesDataSource([
        { owner: "acme", name: "service-openapi", pushedAt: null }
      ])
      const sut = createSut({ graphQlClient, accessibleRepositoriesDataSource })

      const result = await sut.getProjectList()

      expect(result).toHaveLength(1)
    })

    test("It uses config name for config-file-discovered repo", async () => {
      const graphQlClient = createMockGraphQLClient([
        { search: { results: [], pageInfo: { hasNextPage: false } } },
        { search: { results: [], pageInfo: { hasNextPage: false } } },
        {
          repo_0: {
            name: "my-backend",
            owner: { login: "acme" },
            configYml: { text: "name: Backend Service" },
            configYaml: null,
            defaultBranchRef: { target: { oid: "abc" } }
          }
        }
      ])
      const accessibleRepositoriesDataSource = createMockAccessibleRepositoriesDataSource([
        { owner: "acme", name: "my-backend", pushedAt: null }
      ])
      const sut = createSut({ loginsDataSource: createMockLoginsDataSource(["acme"]), graphQlClient, accessibleRepositoriesDataSource })

      const result = await sut.getProjectList()

      expect(result[0].displayName).toBe("Backend Service")
    })

    test("It drops a config-file repo shadowed by a suffixed repo with the same project name", async () => {
      const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {})
      const graphQlClient = createMockGraphQLClient([
        {
          search: {
            results: [{ name: "polaris-openapi", owner: { login: "acme" } }],
            pageInfo: { hasNextPage: false }
          }
        },
        { search: { results: [], pageInfo: { hasNextPage: false } } },
        { repo_0: { name: "polaris", owner: { login: "acme" }, configYml: { text: "" }, configYaml: null, defaultBranchRef: { target: { oid: "abc" } } } }
      ])
      const accessibleRepositoriesDataSource = createMockAccessibleRepositoriesDataSource([
        { owner: "acme", name: "polaris", pushedAt: null }
      ])
      const sut = createSut({ loginsDataSource: createMockLoginsDataSource(["acme"]), graphQlClient, accessibleRepositoriesDataSource })

      const result = await sut.getProjectList()

      expect(result).toHaveLength(1)
      expect(result[0].url).toBe("https://github.com/acme/polaris-openapi")
      consoleWarn.mockRestore()
    })

    test("It reuses a fresh scan without enumerating repositories", async () => {
      const graphQlClient = createMockGraphQLClient([
        { search: { results: [], pageInfo: { hasNextPage: false } } }
      ])
      const accessibleRepositoriesDataSource = createMockAccessibleRepositoriesDataSource([])
      const configFileScanRepository = createMockConfigFileScanRepository({
        scannedAt: Date.now(),
        enumeratedRepositories: ["acme/my-backend"],
        repositories: [
          { name: "my-backend", owner: { login: "acme" }, configYml: { text: "" }, configYaml: null, defaultBranchRef: { target: { oid: "a" } } }
        ]
      })
      const sut = createSut({ graphQlClient, accessibleRepositoriesDataSource, configFileScanRepository })

      const result = await sut.getProjectList()

      expect(result.map(p => p.name)).toEqual(["my-backend"])
      expect(accessibleRepositoriesDataSource.getAccessibleRepositories).not.toHaveBeenCalled()
      expect(configFileScanRepository.set).not.toHaveBeenCalled()
    })

    test("It rescans and stores the result when the cached scan is stale", async () => {
      const graphQlClient = createMockGraphQLClient([
        { search: { results: [], pageInfo: { hasNextPage: false } } },
        { repo_0: { name: "my-backend", owner: { login: "acme" }, configYml: { text: "" }, configYaml: null, defaultBranchRef: { target: { oid: "a" } } } }
      ])
      const accessibleRepositoriesDataSource = createMockAccessibleRepositoriesDataSource([
        { owner: "acme", name: "my-backend", pushedAt: null }
      ])
      const configFileScanRepository = createMockConfigFileScanRepository({
        scannedAt: Date.now() - 11 * 60 * 1000,
        enumeratedRepositories: [],
        repositories: []
      })
      const sut = createSut({ graphQlClient, accessibleRepositoriesDataSource, configFileScanRepository })

      const result = await sut.getProjectList()

      expect(result.map(p => p.name)).toEqual(["my-backend"])
      expect(configFileScanRepository.set).toHaveBeenCalledWith(
        expect.objectContaining({
          repositories: [expect.objectContaining({ name: "my-backend" })]
        })
      )
    })

    test("It carries over unchanged repos and probes only new and recently pushed ones", async () => {
      const graphQlClient = createMockGraphQLClient([
        { search: { results: [], pageInfo: { hasNextPage: false } } },
        {
          repo_0: { name: "just-pushed", owner: { login: "acme" }, configYml: { text: "" }, configYaml: null, defaultBranchRef: { target: { oid: "a" } } },
          repo_1: { name: "brand-new", owner: { login: "acme" }, configYml: null, configYaml: null, defaultBranchRef: { target: { oid: "b" } } }
        }
      ])
      const accessibleRepositoriesDataSource = createMockAccessibleRepositoriesDataSource([
        { owner: "acme", name: "quiet", pushedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
        { owner: "acme", name: "just-pushed", pushedAt: new Date().toISOString() },
        { owner: "acme", name: "brand-new", pushedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() }
      ])
      const configFileScanRepository = createMockConfigFileScanRepository({
        scannedAt: Date.now() - 2 * 3600 * 1000,
        enumeratedRepositories: ["acme/quiet", "acme/just-pushed"],
        repositories: [
          { name: "quiet", owner: { login: "acme" }, configYml: { text: "name: Quiet" }, configYaml: null, defaultBranchRef: { target: { oid: "c" } } }
        ]
      })
      const sut = createSut({ graphQlClient, accessibleRepositoriesDataSource, configFileScanRepository })

      const result = await sut.getProjectList()

      // "quiet" is carried over without probing, "just-pushed" is probed and found,
      // "brand-new" is probed (never enumerated before) and has no config file.
      expect(result.map(p => p.name).sort()).toEqual(["just-pushed", "quiet"])
      const detailQuery = (graphQlClient.graphql as jest.Mock).mock.calls
        .map(call => (call[0] as { query: string }).query)
        .find(query => query.includes("ConfigFileRepos"))
      expect(detailQuery).toContain("just-pushed")
      expect(detailQuery).toContain("brand-new")
      expect(detailQuery).not.toContain("quiet")
    })

    test("It drops carried-over repos that are no longer accessible", async () => {
      const graphQlClient = createMockGraphQLClient([
        { search: { results: [], pageInfo: { hasNextPage: false } } }
      ])
      const accessibleRepositoriesDataSource = createMockAccessibleRepositoriesDataSource([
        { owner: "acme", name: "still-here", pushedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() }
      ])
      const configFileScanRepository = createMockConfigFileScanRepository({
        scannedAt: Date.now() - 2 * 3600 * 1000,
        enumeratedRepositories: ["acme/still-here", "acme/deleted"],
        repositories: [
          { name: "still-here", owner: { login: "acme" }, configYml: { text: "" }, configYaml: null, defaultBranchRef: { target: { oid: "a" } } },
          { name: "deleted", owner: { login: "acme" }, configYml: { text: "" }, configYaml: null, defaultBranchRef: { target: { oid: "b" } } }
        ]
      })
      const sut = createSut({ graphQlClient, accessibleRepositoriesDataSource, configFileScanRepository })

      const result = await sut.getProjectList()

      expect(result.map(p => p.name)).toEqual(["still-here"])
    })

    test("It retries a chunk when GitHub answers with an empty response", async () => {
      let detailCalls = 0
      const graphQlClient: IGitHubGraphQLClient = {
        graphql: jest.fn<(request: { query: string }) => Promise<unknown>>()
          .mockImplementation(request => {
            if (!request.query.includes("ConfigFileRepos")) {
              return Promise.resolve({ search: { results: [], pageInfo: { hasNextPage: false } } })
            }
            detailCalls += 1
            if (detailCalls === 1) {
              // A secondary rate limit surfaces as a response with neither data nor errors.
              return Promise.resolve(undefined)
            }
            return Promise.resolve({
              repo_0: { name: "my-backend", owner: { login: "acme" }, configYml: { text: "" }, configYaml: null, defaultBranchRef: { target: { oid: "a" } } }
            })
          })
      }
      const accessibleRepositoriesDataSource = createMockAccessibleRepositoriesDataSource([
        { owner: "acme", name: "my-backend", pushedAt: null }
      ])
      const sut = createSut({ graphQlClient, accessibleRepositoriesDataSource })

      const result = await sut.getProjectList()

      expect(result.map(p => p.name)).toEqual(["my-backend"])
      expect(detailCalls).toBe(2)
    })

    test("It fails the scan when empty responses persist after retries", async () => {
      const graphQlClient: IGitHubGraphQLClient = {
        graphql: jest.fn<(request: { query: string }) => Promise<unknown>>()
          .mockImplementation(request => {
            if (!request.query.includes("ConfigFileRepos")) {
              return Promise.resolve({ search: { results: [], pageInfo: { hasNextPage: false } } })
            }
            return Promise.resolve(undefined)
          })
      }
      const accessibleRepositoriesDataSource = createMockAccessibleRepositoriesDataSource([
        { owner: "acme", name: "my-backend", pushedAt: null }
      ])
      const sut = createSut({ graphQlClient, accessibleRepositoriesDataSource, emptyResponseRetryDelaysMs: [] })

      await expect(sut.getProjectList()).rejects.toThrow("empty GraphQL response")
    })

    test("It uses partial data when a repository in a chunk cannot be resolved", async () => {
      const partialError = Object.assign(new Error("Could not resolve to a Repository"), {
        data: {
          repo_0: { name: "healthy", owner: { login: "acme" }, configYml: { text: "" }, configYaml: null, defaultBranchRef: { target: { oid: "a" } } },
          repo_1: null
        }
      })
      const graphQlClient: IGitHubGraphQLClient = {
        graphql: jest.fn<(request: { query: string }) => Promise<unknown>>()
          .mockImplementation(request => {
            if (request.query.includes("ConfigFileRepos")) {
              return Promise.reject(partialError)
            }
            return Promise.resolve({ search: { results: [], pageInfo: { hasNextPage: false } } })
          })
      }
      const accessibleRepositoriesDataSource = createMockAccessibleRepositoriesDataSource([
        { owner: "acme", name: "healthy", pushedAt: null },
        { owner: "acme", name: "vanished", pushedAt: null }
      ])
      const sut = createSut({ graphQlClient, accessibleRepositoriesDataSource })

      const result = await sut.getProjectList()

      expect(result.map(p => p.name)).toEqual(["healthy"])
    })

    test("It returns suffix-discovered repos when no accessible repo contains the config file", async () => {
      const graphQlClient = createMockGraphQLClient([
        {
          search: {
            results: [{ name: "project-openapi", owner: { login: "acme" } }],
            pageInfo: { hasNextPage: false }
          }
        }
      ])
      const sut = createSut({ graphQlClient, accessibleRepositoriesDataSource: createMockAccessibleRepositoriesDataSource([]) })

      const result = await sut.getProjectList()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("project")
    })
  })
})
