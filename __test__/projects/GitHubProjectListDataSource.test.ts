import { jest } from "@jest/globals"
import { GitHubProjectListDataSource } from "@/features/projects/data"
import { IGitHubLoginDataSource, IGitHubGraphQLClient } from "@/features/projects/domain"
import IGitHubCodeSearchDataSource, { CodeSearchRepository } from "@/features/projects/domain/IGitHubCodeSearchDataSource"

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

const createMockCodeSearchDataSource = (
  repos: CodeSearchRepository[] = []
): IGitHubCodeSearchDataSource => ({
  searchRepositoriesContainingFile: jest.fn<() => Promise<CodeSearchRepository[]>>()
    .mockResolvedValue(repos)
})

const createSut = (overrides: {
  loginsDataSource?: IGitHubLoginDataSource
  graphQlClient?: IGitHubGraphQLClient
  codeSearchDataSource?: IGitHubCodeSearchDataSource
  repositoryNameSuffix?: string
  projectConfigurationFilename?: string
  hiddenRepositories?: string[]
} = {}) => {
  return new GitHubProjectListDataSource({
    loginsDataSource: overrides.loginsDataSource || createMockLoginsDataSource(),
    graphQlClient: overrides.graphQlClient || createMockGraphQLClient(),
    codeSearchDataSource: overrides.codeSearchDataSource || createMockCodeSearchDataSource(),
    repositoryNameSuffix: overrides.repositoryNameSuffix || "-openapi",
    projectConfigurationFilename: overrides.projectConfigurationFilename || ".framna-docs.yml",
    hiddenRepositories: overrides.hiddenRepositories || []
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

  test("It sorts projects by config name when available, falling back to repository name", async () => {
    const graphQlClient = createMockGraphQLClient([
      {
        search: {
          results: [
            {
              name: "zebra-openapi",
              owner: { login: "acme" },
              configYml: { text: "name: Banana" }
            },
            { name: "middle-openapi", owner: { login: "acme" } },
            {
              name: "alpha-openapi",
              owner: { login: "acme" },
              configYml: { text: "name: Zulu" }
            }
          ],
          pageInfo: { hasNextPage: false }
        }
      }
    ])
    const sut = createSut({ graphQlClient })

    const result = await sut.getProjectList()

    expect(result.map(p => p.displayName)).toEqual(["Banana", "middle", "Zulu"])
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
    test("It includes repos discovered via config file even without the suffix", async () => {
      const graphQlClient = createMockGraphQLClient([
        { search: { results: [], pageInfo: { hasNextPage: false } } },
        { search: { results: [], pageInfo: { hasNextPage: false } } },
        { repo_0: { name: "my-backend", owner: { login: "acme" }, configYml: null, configYaml: null, defaultBranchRef: { target: { oid: "abc" } } } }
      ])
      const codeSearchDataSource = createMockCodeSearchDataSource([
        { owner: "acme", name: "my-backend", isPrivate: true }
      ])
      const sut = createSut({ loginsDataSource: createMockLoginsDataSource(["acme"]), graphQlClient, codeSearchDataSource })

      const result = await sut.getProjectList()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("my-backend")
    })

    test("It searches for both config file variants", async () => {
      const codeSearchDataSource = createMockCodeSearchDataSource([])
      const loginsDataSource = createMockLoginsDataSource(["jdoe", "acme"])
      const sut = createSut({ loginsDataSource, codeSearchDataSource })

      await sut.getProjectList()

      const filenames = (codeSearchDataSource.searchRepositoriesContainingFile as jest.Mock).mock.calls.map(call => call[0])
      expect(filenames.sort()).toEqual([".framna-docs.yaml", ".framna-docs.yml"])
    })

    test("It keeps private repos and public repos owned by a login, and drops foreign public repos", async () => {
      const graphQlClient = createMockGraphQLClient([
        { search: { results: [], pageInfo: { hasNextPage: false } } },
        { search: { results: [], pageInfo: { hasNextPage: false } } },
        {
          repo_0: { name: "private-elsewhere", owner: { login: "other-org" }, configYml: null, configYaml: null, defaultBranchRef: { target: { oid: "a" } } },
          repo_1: { name: "public-own", owner: { login: "acme" }, configYml: null, configYaml: null, defaultBranchRef: { target: { oid: "b" } } }
        }
      ])
      const codeSearchDataSource = createMockCodeSearchDataSource([
        { owner: "other-org", name: "private-elsewhere", isPrivate: true },
        { owner: "acme", name: "public-own", isPrivate: false },
        { owner: "stranger", name: "public-foreign", isPrivate: false }
      ])
      const sut = createSut({ loginsDataSource: createMockLoginsDataSource(["acme"]), graphQlClient, codeSearchDataSource })

      const result = await sut.getProjectList()

      const names = result.map(p => p.name).sort()
      expect(names).toEqual(["private-elsewhere", "public-own"])
    })

    test("It deduplicates repos found by both suffix search and config-file search", async () => {
      const graphQlClient = createMockGraphQLClient([
        {
          search: {
            results: [{ name: "service-openapi", owner: { login: "acme" } }],
            pageInfo: { hasNextPage: false }
          }
        },
        { repo_0: { name: "service-openapi", owner: { login: "acme" }, configYml: null, configYaml: null, defaultBranchRef: { target: { oid: "abc" } } } }
      ])
      const codeSearchDataSource = createMockCodeSearchDataSource([
        { owner: "acme", name: "service-openapi", isPrivate: true }
      ])
      const sut = createSut({ graphQlClient, codeSearchDataSource })

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
      const codeSearchDataSource = createMockCodeSearchDataSource([
        { owner: "acme", name: "my-backend", isPrivate: true }
      ])
      const sut = createSut({ loginsDataSource: createMockLoginsDataSource(["acme"]), graphQlClient, codeSearchDataSource })

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
        { repo_0: { name: "polaris", owner: { login: "acme" }, configYml: null, configYaml: null, defaultBranchRef: { target: { oid: "abc" } } } }
      ])
      const codeSearchDataSource = createMockCodeSearchDataSource([
        { owner: "acme", name: "polaris", isPrivate: true }
      ])
      const sut = createSut({ loginsDataSource: createMockLoginsDataSource(["acme"]), graphQlClient, codeSearchDataSource })

      const result = await sut.getProjectList()

      expect(result).toHaveLength(1)
      expect(result[0].url).toBe("https://github.com/acme/polaris-openapi")
      consoleWarn.mockRestore()
    })

    test("It returns suffix-discovered repos when code search finds nothing", async () => {
      const graphQlClient = createMockGraphQLClient([
        {
          search: {
            results: [{ name: "project-openapi", owner: { login: "acme" } }],
            pageInfo: { hasNextPage: false }
          }
        }
      ])
      const sut = createSut({ graphQlClient, codeSearchDataSource: createMockCodeSearchDataSource([]) })

      const result = await sut.getProjectList()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("project")
    })
  })
})
