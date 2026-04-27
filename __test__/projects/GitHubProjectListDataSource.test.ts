import { jest } from "@jest/globals"
import { GitHubProjectListDataSource } from "@/features/projects/data"
import { IGitHubLoginDataSource, IGitHubGraphQLClient } from "@/features/projects/domain"

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

const createSut = (overrides: {
  loginsDataSource?: IGitHubLoginDataSource
  graphQlClient?: IGitHubGraphQLClient
  repositoryNameSuffix?: string
  projectConfigurationFilename?: string
  hiddenRepositories?: string[]
} = {}) => {
  return new GitHubProjectListDataSource({
    loginsDataSource: overrides.loginsDataSource || createMockLoginsDataSource(),
    graphQlClient: overrides.graphQlClient || createMockGraphQLClient(),
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
})
