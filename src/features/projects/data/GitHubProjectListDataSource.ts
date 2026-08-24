import { splitOwnerAndRepository, ProjectRepositoryNaming } from "@/common"
import {
  ProjectSummary,
  IProjectListDataSource,
  IGitHubLoginDataSource,
  IGitHubGraphQLClient,
  ProjectConfigParser
} from "../domain"
import IProjectConfig from "../domain/IProjectConfig"
import IGitHubCodeSearchDataSource from "../domain/IGitHubCodeSearchDataSource"

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
  private readonly codeSearchDataSource: IGitHubCodeSearchDataSource
  private readonly naming: ProjectRepositoryNaming
  private readonly hiddenRepositories: { owner: string; repository: string }[]

  constructor(config: {
    loginsDataSource: IGitHubLoginDataSource
    graphQlClient: IGitHubGraphQLClient
    codeSearchDataSource: IGitHubCodeSearchDataSource
    repositoryNameSuffix: string
    projectConfigurationFilename: string
    hiddenRepositories: string[]
  }) {
    this.loginsDataSource = config.loginsDataSource
    this.graphQlClient = config.graphQlClient
    this.codeSearchDataSource = config.codeSearchDataSource
    this.naming = new ProjectRepositoryNaming(config)
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
    const [suffixRepos, configFileRepos] = await Promise.all([
      this.getRepositoriesForLoginsByNameSuffix(logins),
      this.getRepositoriesForLoginsByConfigFile(logins)
    ])
    const repos = dedupeBy(
      [...suffixRepos, ...configFileRepos],
      repo => `${repo.owner.login}/${repo.name}`
    )
    return this.resolveProjectNameCollisions(repos)
  }

  // "foo-openapi" and "foo" both map to the project name "foo". Project details resolves the
  // suffixed repository first, so the list must do the same: keep the suffixed repo and drop
  // the shadowed one, otherwise the list shows entries that cannot be reached.
  private resolveProjectNameCollisions(repos: GraphQLProjectListRepository[]): GraphQLProjectListRepository[] {
    const byProject = new Map<string, GraphQLProjectListRepository>()
    for (const repo of repos) {
      const key = `${repo.owner.login}/${this.naming.projectName(repo.name)}`
      const existing = byProject.get(key)
      if (!existing) {
        byProject.set(key, repo)
        continue
      }
      const winner = this.naming.hasSuffix(existing.name) ? existing : repo
      const shadowed = winner === existing ? repo : existing
      byProject.set(key, winner)
      console.warn(`Project name collision for ${key}: ${winner.owner.login}/${winner.name} shadows ${shadowed.owner.login}/${shadowed.name}`)
    }
    return Array.from(byProject.values())
  }

  private async getRepositoriesForLoginsByNameSuffix(logins: string[]): Promise<GraphQLProjectListRepository[]> {
    const searchQueries: string[] = [
      `"${this.naming.suffix}" in:name is:private`,
      ...logins.map(login => `"${this.naming.suffix}" in:name user:${login} is:public`)
    ]

    const results = await Promise.all(
      searchQueries.map(query => this.searchRepositories(query))
    )

    return dedupeBy(results.flat(), repo => `${repo.owner.login}/${repo.name}`)
      .filter(repo => this.naming.hasSuffix(repo.name))
  }

  private async getRepositoriesForLoginsByConfigFile(logins: string[]): Promise<GraphQLProjectListRepository[]> {
    const results = await Promise.all(
      this.naming.configFileVariants.map(filename =>
        this.codeSearchDataSource.searchRepositoriesContainingFile(filename)
      )
    )

    // The search is global, so keep private repos (access implies permission) and public
    // repos owned by a known login; foreign public repos that happen to contain the file
    // must not leak into the portal.
    const refs = dedupeBy(results.flat(), repo => `${repo.owner}/${repo.name}`)
      .filter(repo => repo.isPrivate || logins.includes(repo.owner))
    if (refs.length === 0) return []

    return await this.fetchRepositoryDetails(refs)
  }

  private async fetchRepositoryDetails(
    repos: Array<{ owner: string; name: string }>
  ): Promise<GraphQLProjectListRepository[]> {
    const aliases = repos.map((repo, i) => `
      repo_${i}: repository(owner: ${JSON.stringify(repo.owner)}, name: ${JSON.stringify(repo.name)}) {
        ${this.repositoryFields()}
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
              ${this.repositoryFields()}
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

  private repositoryFields(): string {
    return `
      name
      owner { login }
      defaultBranchRef {
        target { ... on Commit { oid } }
      }
      configYml: object(expression: ${JSON.stringify(`HEAD:${this.naming.configFileYml}`)}) {
        ... on Blob { text }
      }
      configYaml: object(expression: ${JSON.stringify(`HEAD:${this.naming.configFileYaml}`)}) {
        ... on Blob { text }
      }
    `
  }

  private mapToSummary(repo: GraphQLProjectListRepository): ProjectSummary {
    const { config, configError } = this.parseConfig(repo)
    const defaultName = this.naming.projectName(repo.name)

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
    const { config, error } = new ProjectConfigParser().tryParse(yml.text)
    if (error) {
      // A broken config in one repository must not take down the whole project list.
      // Surface the error on the project instead.
      console.error(`Invalid project config in ${repo.owner.login}/${repo.name}: ${error}`)
      return { config: null, configError: error }
    }
    return { config }
  }

  private makeImageURL(owner: string, repo: string, imagePath: string, oid?: string): string {
    return `/api/blob/${owner}/${repo}/${encodeURIComponent(imagePath)}?ref=${oid ?? "HEAD"}`
  }
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter(item => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
