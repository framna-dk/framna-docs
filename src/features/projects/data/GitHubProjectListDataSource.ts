import { splitOwnerAndRepository, ProjectRepositoryNaming } from "@/common"
import {
  ProjectSummary,
  IProjectListDataSource,
  IGitHubLoginDataSource,
  IGitHubGraphQLClient,
  ProjectConfigParser
} from "../domain"
import IProjectConfig from "../domain/IProjectConfig"
import IGitHubAccessibleRepositoriesDataSource, { AccessibleRepositoryRef } from "../domain/IGitHubAccessibleRepositoriesDataSource"
import IConfigFileScanRepository, { ConfigFileScan } from "../domain/IConfigFileScanRepository"

// GitHub cancels GraphQL queries that run close to its ~10 second execution timeout with
// a 502, and resolving a config-file expression per repository is expensive, so keep each
// query small enough to finish well within it.
const MAX_REPOSITORY_DETAILS_ALIASES_PER_QUERY = 50

// GitHub's secondary rate limits punish concurrent heavy GraphQL queries from the same
// token, so chunks are fetched with limited parallelism instead of all at once.
const MAX_CONCURRENT_REPOSITORY_DETAILS_QUERIES = 2

// A scan this recent is reused as-is, so bursts of refreshes (page load plus window
// focus) do not repeatedly re-enumerate the user's repositories.
const CONFIG_FILE_SCAN_REUSE_MS = 60 * 1000

// Repositories pushed within this margin before the previous scan are probed again, so
// clock skew between GitHub's pushed-at timestamps and this server cannot skip a change.
const CONFIG_FILE_SCAN_PUSH_OVERLAP_MS = 10 * 60 * 1000

// GitHub answers a secondary rate limit on GraphQL with HTTP 200 and a body carrying
// neither data nor errors, which slips past Octokit's throttling plugin and surfaces as
// an empty response. GitHub asks clients to wait at least a minute before retrying.
const EMPTY_RESPONSE_RETRY_DELAYS_MS = [60 * 1000, 60 * 1000]

type GraphQLProjectListRepository = {
  readonly name: string
  readonly owner: {
    readonly login: string
  }
  readonly defaultBranchRef?: {
    readonly target: {
      readonly oid: string
    }
  } | null
  readonly configYml?: {
    readonly text?: string
  } | null
  readonly configYaml?: {
    readonly text?: string
  } | null
}

export default class GitHubProjectListDataSource implements IProjectListDataSource {
  private readonly loginsDataSource: IGitHubLoginDataSource
  private readonly graphQlClient: IGitHubGraphQLClient
  private readonly accessibleRepositoriesDataSource: IGitHubAccessibleRepositoriesDataSource
  private readonly configFileScanRepository: IConfigFileScanRepository
  private readonly naming: ProjectRepositoryNaming
  private readonly hiddenRepositories: { owner: string; repository: string }[]
  private readonly emptyResponseRetryDelaysMs: number[]

  constructor(config: {
    loginsDataSource: IGitHubLoginDataSource
    graphQlClient: IGitHubGraphQLClient
    accessibleRepositoriesDataSource: IGitHubAccessibleRepositoriesDataSource
    configFileScanRepository: IConfigFileScanRepository
    repositoryNameSuffix: string
    projectConfigurationFilename: string
    hiddenRepositories: string[]
    emptyResponseRetryDelaysMs?: number[]
  }) {
    this.loginsDataSource = config.loginsDataSource
    this.graphQlClient = config.graphQlClient
    this.accessibleRepositoriesDataSource = config.accessibleRepositoriesDataSource
    this.configFileScanRepository = config.configFileScanRepository
    this.emptyResponseRetryDelaysMs = config.emptyResponseRetryDelaysMs ?? EMPTY_RESPONSE_RETRY_DELAYS_MS
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
      this.getRepositoriesByConfigFile()
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

  // Enumerates every repository the user's token can access and probes for the
  // configuration file at HEAD. Reading HEAD directly picks up a freshly pushed file on
  // the next refresh, unlike GitHub's code search whose index lags pushes by hours or
  // days. Enumeration is inherently scoped to accessible repositories, so no visibility
  // filtering is needed: foreign public repositories are never enumerated.
  private async getRepositoriesByConfigFile(): Promise<GraphQLProjectListRepository[]> {
    const previousScan = await this.configFileScanRepository.get()
    if (previousScan && Date.now() - previousScan.scannedAt < CONFIG_FILE_SCAN_REUSE_MS) {
      return previousScan.repositories
    }
    const scannedAt = Date.now()
    const enumerated = await this.accessibleRepositoriesDataSource.getAccessibleRepositories()
    const repositories = await this.scanForConfigFiles(enumerated, previousScan)
    await this.configFileScanRepository.set({
      scannedAt,
      enumeratedRepositories: enumerated.map(repo => `${repo.owner}/${repo.name}`),
      repositories
    })
    return repositories
  }

  // A repository's HEAD, and therefore its configuration file, can only change through a
  // push, so probing every accessible repository is only needed once per user. Later
  // scans probe just the repositories that could have changed: ones not enumerated before
  // (created, renamed, or newly granted access) and ones pushed since the previous scan.
  // Results for everything else are carried over, which keeps the steady-state GitHub
  // load small enough to run on every refresh.
  private async scanForConfigFiles(
    enumerated: AccessibleRepositoryRef[],
    previousScan: ConfigFileScan | undefined
  ): Promise<GraphQLProjectListRepository[]> {
    let probeRefs = enumerated
    let carriedOver: GraphQLProjectListRepository[] = []
    if (previousScan) {
      const previouslyEnumerated = new Set(previousScan.enumeratedRepositories)
      const pushedSince = previousScan.scannedAt - CONFIG_FILE_SCAN_PUSH_OVERLAP_MS
      probeRefs = enumerated.filter(repo =>
        !previouslyEnumerated.has(`${repo.owner}/${repo.name}`) ||
        (repo.pushedAt != null && Date.parse(repo.pushedAt) >= pushedSince)
      )
      const probedKeys = new Set(probeRefs.map(repo => `${repo.owner}/${repo.name}`))
      const enumeratedKeys = new Set(enumerated.map(repo => `${repo.owner}/${repo.name}`))
      carriedOver = previousScan.repositories.filter(repo => {
        const key = `${repo.owner.login}/${repo.name}`
        return enumeratedKeys.has(key) && !probedKeys.has(key)
      })
    }
    const probed = probeRefs.length > 0 ? await this.fetchRepositoryDetails(probeRefs) : []
    const probedHits = probed.filter(repo => repo.configYml != null || repo.configYaml != null)
    return [...carriedOver, ...probedHits]
  }

  private async fetchRepositoryDetails(
    repos: Array<{ owner: string; name: string }>
  ): Promise<GraphQLProjectListRepository[]> {
    const chunks: Array<typeof repos> = []
    for (let i = 0; i < repos.length; i += MAX_REPOSITORY_DETAILS_ALIASES_PER_QUERY) {
      chunks.push(repos.slice(i, i + MAX_REPOSITORY_DETAILS_ALIASES_PER_QUERY))
    }
    const chunkResults: GraphQLProjectListRepository[][] = new Array(chunks.length)
    let nextChunkIndex = 0
    const worker = async () => {
      while (nextChunkIndex < chunks.length) {
        const index = nextChunkIndex
        nextChunkIndex += 1
        // Chunks are deliberately awaited in a loop: each worker processes one chunk at a
        // time so at most MAX_CONCURRENT_REPOSITORY_DETAILS_QUERIES queries are in flight.
        // eslint-disable-next-line no-await-in-loop
        chunkResults[index] = await this.fetchRepositoryDetailsChunk(chunks[index])
      }
    }
    const workerCount = Math.min(MAX_CONCURRENT_REPOSITORY_DETAILS_QUERIES, chunks.length)
    await Promise.all(Array.from({ length: workerCount }, worker))
    return chunkResults.flat()
  }

  private async fetchRepositoryDetailsChunk(
    repos: Array<{ owner: string; name: string }>
  ): Promise<GraphQLProjectListRepository[]> {
    const aliases = repos.map((repo, i) => `
      repo_${i}: repository(owner: ${JSON.stringify(repo.owner)}, name: ${JSON.stringify(repo.name)}) {
        ${this.repositoryFields()}
      }
    `).join("\n")

    const query = `query ConfigFileRepos { ${aliases} }`
    const response = await this.executeRepositoryDetailsQuery(query)

    const results: GraphQLProjectListRepository[] = []
    repos.forEach((_, i) => {
      const repo = response[`repo_${i}`]
      if (repo) results.push(repo)
    })
    return results
  }

  private async executeRepositoryDetailsQuery(
    query: string
  ): Promise<Record<string, GraphQLProjectListRepository | null>> {
    for (let attempt = 0; ; attempt++) {
      let response: Record<string, GraphQLProjectListRepository | null> | null | undefined
      try {
        // Deliberately awaited in a loop: each attempt must finish before retrying.
        // eslint-disable-next-line no-await-in-loop
        response = await this.graphQlClient.graphql({ query })
      } catch (error) {
        // A single unresolvable repository (deleted mid-scan, DMCA'd, IP-restricted) fails
        // the whole query with a GraphQL error that still carries the other aliases, so use
        // that partial data instead of failing the entire scan.
        const partialData = (error as { data?: Record<string, GraphQLProjectListRepository | null> })?.data
        if (partialData == null) throw error
        response = partialData
      }
      if (response != null) {
        return response
      }
      // See EMPTY_RESPONSE_RETRY_DELAYS_MS: an empty response is a secondary rate limit.
      if (attempt >= this.emptyResponseRetryDelaysMs.length) {
        throw new Error("GitHub returned an empty GraphQL response for a repository details query, most likely a secondary rate limit")
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(this.emptyResponseRetryDelaysMs[attempt])
    }
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
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
