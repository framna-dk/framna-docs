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
import type { default as IProjectDiscoveryRepository, ProjectDiscoveryRepository } from "../domain/IProjectDiscoveryRepository"

const MAX_REGISTERED_REPOSITORY_PROBES = 4

type GraphQLProjectListRepository = {
  readonly name: string
  readonly isPrivate?: boolean
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
  private readonly discoveryRepository: IProjectDiscoveryRepository
  private readonly naming: ProjectRepositoryNaming
  private readonly hiddenRepositories: { owner: string; repository: string }[]

  constructor(config: {
    loginsDataSource: IGitHubLoginDataSource
    graphQlClient: IGitHubGraphQLClient
    codeSearchDataSource: IGitHubCodeSearchDataSource
    discoveryRepository: IProjectDiscoveryRepository
    repositoryNameSuffix: string
    projectConfigurationFilename: string
    hiddenRepositories: string[]
  }) {
    this.loginsDataSource = config.loginsDataSource
    this.graphQlClient = config.graphQlClient
    this.codeSearchDataSource = config.codeSearchDataSource
    this.discoveryRepository = config.discoveryRepository
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
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  async getProjectCandidate(candidate: ProjectDiscoveryRepository) {
    const logins = await this.loginsDataSource.getLogins()
    const [repository] = await this.getRegisteredRepositories(logins, [candidate])
    if (!repository || this.isHidden(repository)) return undefined
    return {
      repository: { owner: repository.owner.login, name: repository.name },
      project: this.mapToSummary(repository)
    }
  }

  private isHidden(repo: GraphQLProjectListRepository): boolean {
    return this.hiddenRepositories.some(
      hidden => hidden.owner === repo.owner.login && hidden.repository === repo.name
    )
  }

  private async getRepositoriesForLogins(logins: string[]): Promise<GraphQLProjectListRepository[]> {
    const [suffixRepos, configFileRepos, candidates] = await Promise.all([
      this.getRepositoriesForLoginsByNameSuffix(logins),
      this.getRepositoriesForLoginsByConfigFile(logins),
      this.discoveryRepository.getRepositories()
    ])
    const automatic = [...suffixRepos, ...configFileRepos]
    const found = new Set(automatic.map(repo => `${repo.owner.login}/${repo.name}`.toLowerCase()))
    const registeredRepos = await this.getRegisteredRepositories(logins,
      candidates.filter(repo => !found.has(`${repo.owner}/${repo.name}`.toLowerCase()))
    )
    return dedupeBy(
      [...automatic, ...registeredRepos],
      repo => `${repo.owner.login}/${repo.name}`.toLowerCase()
    )
  }

  private async getRegisteredRepositories(
    logins: string[],
    candidates: ProjectDiscoveryRepository[]
  ): Promise<GraphQLProjectListRepository[]> {
    const registered = dedupeBy(
      candidates,
      repo => `${repo.owner}/${repo.name}`.toLowerCase()
    )
    const knownOwners = new Set(logins.map(login => login.toLowerCase()))
    const probe = async (repo: ProjectDiscoveryRepository) => {
      try {
        // Probe each candidate with the user's token. A missing or inaccessible repo
        // must not prevent other registered repositories from being discovered.
        const response = await this.graphQlClient.graphql({
          query: `query RegisteredRepository($owner: String!, $name: String!) {
            repository(owner: $owner, name: $name) { ${this.repositoryFields()} }
          }`,
          variables: { owner: repo.owner, name: repo.name }
        })
        const repository = response.repository as GraphQLProjectListRepository | null
        if (!repository) return undefined
        // Match code-search visibility rules: accessible private repositories and
        // public repositories belonging to the viewer or one of their organizations.
        if (!repository.isPrivate && !knownOwners.has(repository.owner.login.toLowerCase())) return undefined
        if (!this.naming.hasSuffix(repository.name) && !repository.configYml && !repository.configYaml) return undefined
        return repository
      } catch (error) {
        if (isNotFoundError(error)) return undefined
        throw error
      }
    }
    const results: (GraphQLProjectListRepository | undefined)[] = []
    // Bound request bursts from the shared table; stop scheduling new batches
    // when a service error occurs, while missing repositories remain skippable.
    for (let i = 0; i < registered.length; i += MAX_REGISTERED_REPOSITORY_PROBES) {
      // Batches must run sequentially to enforce the concurrency bound.
      // eslint-disable-next-line no-await-in-loop
      const batch = await Promise.all(registered.slice(i, i + MAX_REGISTERED_REPOSITORY_PROBES).map(probe))
      results.push(...batch)
    }
    return results.filter((repo): repo is GraphQLProjectListRepository => repo !== undefined)
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
      isPrivate
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
      id: this.naming.projectId(repo.owner.login, repo.name),
      name: defaultName,
      path: this.naming.projectPath(repo.owner.login, repo.name),
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

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const details = error as { type?: string; errors?: { type?: string }[] }
  return details.type === "NOT_FOUND" ||
    (details.errors?.length !== undefined && details.errors.length > 0 &&
      details.errors.every(item => item.type === "NOT_FOUND"))
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
