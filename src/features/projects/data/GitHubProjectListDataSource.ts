import { ZodError } from "zod"
import { splitOwnerAndRepository } from "@/common"
import {
  ProjectSummary,
  IProjectListDataSource,
  IGitHubLoginDataSource,
  IGitHubGraphQLClient,
  ProjectConfigParser
} from "../domain"
import IProjectConfig from "../domain/IProjectConfig"
import IGitHubCodeSearchDataSource from "../domain/IGitHubCodeSearchDataSource"

function formatConfigError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map(issue => issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message)
      .join("; ")
  }
  return error instanceof Error ? error.message : String(error)
}

type GraphQLProjectListRepository = {
  readonly name: string
  readonly owner: {
    readonly login: string
  }
  readonly defaultBranchRef?: {
    readonly target: {
      readonly oid: string
    }
  }
  readonly configYml?: {
    readonly text: string
  }
  readonly configYaml?: {
    readonly text: string
  }
}

export default class GitHubProjectListDataSource implements IProjectListDataSource {
  private readonly loginsDataSource: IGitHubLoginDataSource
  private readonly graphQlClient: IGitHubGraphQLClient
  private readonly codeSearchDataSource: IGitHubCodeSearchDataSource | null
  private readonly repositoryNameSuffix: string
  private readonly projectConfigurationFilename: string
  private readonly hiddenRepositories: { owner: string; repository: string }[]

  constructor(config: {
    loginsDataSource: IGitHubLoginDataSource
    graphQlClient: IGitHubGraphQLClient
    codeSearchDataSource?: IGitHubCodeSearchDataSource
    repositoryNameSuffix: string
    projectConfigurationFilename: string
    hiddenRepositories: string[]
  }) {
    this.loginsDataSource = config.loginsDataSource
    this.graphQlClient = config.graphQlClient
    this.codeSearchDataSource = config.codeSearchDataSource ?? null
    this.repositoryNameSuffix = config.repositoryNameSuffix
    this.projectConfigurationFilename = config.projectConfigurationFilename.replace(/\.ya?ml$/, "")
    this.hiddenRepositories = config.hiddenRepositories
      .map(splitOwnerAndRepository)
      .filter((e): e is { owner: string; repository: string } => e !== undefined)
  }

  async getProjectList(): Promise<ProjectSummary[]> {
    const logins = await this.loginsDataSource.getLogins()
    const repositories = await this.getRepositoriesForLogins(logins)
    return repositories
      .filter(repo => !this.isHidden(repo))
      .map(repo => this.mapToSummary(repo))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  private isHidden(repo: GraphQLProjectListRepository): boolean {
    return this.hiddenRepositories.some(
      hidden => hidden.owner === repo.owner.login && hidden.repository === repo.name
    )
  }

  private async getRepositoriesForLogins(logins: string[]): Promise<GraphQLProjectListRepository[]> {
    const suffixRepos = await this.getRepositoriesForLoginsByNameSuffix(logins)
    const configFileRepos = await this.getRepositoriesForLoginsByConfigFile(logins)
    return this.deduplicateRepositories([...suffixRepos, ...configFileRepos])
  }

  private async getRepositoriesForLoginsByNameSuffix(logins: string[]): Promise<GraphQLProjectListRepository[]> {
    const searchQueries: string[] = [
      `"${this.repositoryNameSuffix}" in:name is:private`,
      ...logins.map(login => `"${this.repositoryNameSuffix}" in:name user:${login} is:public`)
    ]

    const results = await Promise.all(
      searchQueries.map(query => this.searchRepositories(query))
    )

    return this.deduplicateRepositories(results.flat())
      .filter(repo => repo.name.endsWith(this.repositoryNameSuffix))
  }

  private async getRepositoriesForLoginsByConfigFile(logins: string[]): Promise<GraphQLProjectListRepository[]> {
    if (!this.codeSearchDataSource) return []

    const configFilename = `${this.projectConfigurationFilename}.yml`
    const queries = [
      `filename:${configFilename} is:private`,
      ...logins.map(login => `filename:${configFilename} user:${login} is:public`)
    ]

    const searchResults = await Promise.all(
      queries.map(q => this.codeSearchDataSource!.searchRepositoriesContainingFile(q))
    )

    const refs = this.deduplicateCodeSearchResults(searchResults.flat())
    if (refs.length === 0) return []

    return await this.fetchRepositoryDetails(refs)
  }

  private deduplicateCodeSearchResults(
    repos: Array<{ owner: string; name: string }>
  ): Array<{ owner: string; name: string }> {
    const seen = new Set<string>()
    return repos.filter(repo => {
      const key = `${repo.owner}/${repo.name}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  private async fetchRepositoryDetails(
    repos: Array<{ owner: string; name: string }>
  ): Promise<GraphQLProjectListRepository[]> {
    if (repos.length === 0) return []

    const aliases = repos.map((repo, i) => `
      repo_${i}: repository(owner: "${repo.owner}", name: "${repo.name}") {
        name
        owner { login }
        defaultBranchRef {
          target { ... on Commit { oid } }
        }
        configYml: object(expression: "HEAD:${this.projectConfigurationFilename}.yml") {
          ... on Blob { text }
        }
        configYaml: object(expression: "HEAD:${this.projectConfigurationFilename}.yaml") {
          ... on Blob { text }
        }
      }
    `).join("\n")

    const query = `query ConfigFileRepos { ${aliases} }`
    const response = await this.graphQlClient.graphql({ query })

    const results: GraphQLProjectListRepository[] = []
    repos.forEach((_, i) => {
      const repo = response[`repo_${i}`]
      if (repo) results.push(repo)
    })
    return results
  }

  private async searchRepositories(
    searchQuery: string,
    cursor?: string
  ): Promise<GraphQLProjectListRepository[]> {
    const request = {
      query: `
      query ProjectList($searchQuery: String!, $cursor: String) {
        search(query: $searchQuery, type: REPOSITORY, first: 100, after: $cursor) {
          results: nodes {
            ... on Repository {
              name
              owner { login }
              defaultBranchRef {
                target {
                  ... on Commit { oid }
                }
              }
              configYml: object(expression: "HEAD:${this.projectConfigurationFilename}.yml") {
                ... on Blob { text }
              }
              configYaml: object(expression: "HEAD:${this.projectConfigurationFilename}.yaml") {
                ... on Blob { text }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      `,
      variables: { searchQuery, cursor }
    }

    const response = await this.graphQlClient.graphql(request)
    if (!response.search?.results) {
      return []
    }

    const pageInfo = response.search.pageInfo
    if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) {
      return response.search.results
    }

    const nextResults = await this.searchRepositories(searchQuery, pageInfo.endCursor)
    return response.search.results.concat(nextResults)
  }

  private deduplicateRepositories(repos: GraphQLProjectListRepository[]): GraphQLProjectListRepository[] {
    const seen = new Set<string>()
    return repos.filter(repo => {
      const key = `${repo.owner.login}/${repo.name}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  private mapToSummary(repo: GraphQLProjectListRepository): ProjectSummary {
    const { config, configError } = this.parseConfig(repo)
    const defaultName = repo.name.replace(new RegExp(this.repositoryNameSuffix + "$"), "")

    return {
      id: `${repo.owner.login}-${defaultName}`,
      name: defaultName,
      displayName: config?.name || defaultName,
      owner: repo.owner.login,
      imageURL: config?.image ? this.makeImageURL(repo.owner.login, repo.name, config.image, repo.defaultBranchRef?.target.oid) : undefined,
      url: `https://github.com/${repo.owner.login}/${repo.name}`,
      ownerUrl: `https://github.com/${repo.owner.login}`,
      configError
    }
  }

  private parseConfig(repo: GraphQLProjectListRepository): { config: IProjectConfig | null, configError?: string } {
    const yml = repo.configYml || repo.configYaml
    if (!yml?.text) return { config: null }
    const parser = new ProjectConfigParser()
    try {
      return { config: parser.parse(yml.text) }
    } catch (error) {
      // A broken config in one repository must not take down the whole project list.
      // Surface the error on the project instead.
      console.error(`Invalid project config in ${repo.owner.login}/${repo.name}:`, error)
      return { config: null, configError: formatConfigError(error) }
    }
  }

  private makeImageURL(owner: string, repo: string, imagePath: string, oid?: string): string {
    return `/api/blob/${owner}/${repo}/${encodeURIComponent(imagePath)}?ref=${oid ?? "HEAD"}`
  }
}
