import { createHash } from "crypto"
import { ProjectRepositoryNaming } from "@/common"
import { IEncryptionService } from "@/features/encrypt/EncryptionService"
import {
  Project,
  Version,
  IProjectDetailsDataSource,
  IGitHubGraphQLClient,
  ProjectConfigParser,
  IProjectConfig,
  ProjectConfigRemoteVersion,
  ProjectConfigRemoteSpecification,
  ProjectConfigSpecification
} from "../domain"
import RemoteConfig from "../domain/RemoteConfig"
import { IRemoteConfigEncoder } from "../domain/RemoteConfigEncoder"

// GitHub rejects GraphQL queries above a node budget; keep each spec-existence query
// comfortably below it.
const MAX_SPEC_EXISTENCE_ALIASES_PER_QUERY = 250

type GraphQLRef = {
  name: string
  target: {
    oid: string
    tree: {
      entries: { name: string }[]
    }
  }
}

type GraphQLPullRequest = {
  number: number
  headRefName: string
  baseRefName: string
  baseRefOid: string
  files?: {
    nodes?: { path: string }[]
  }
}

type PullRequestInfo = {
  number: number
  baseRefName: string
  baseRefOid: string
  changedFiles: string[]
}

type SpecificationSource = {
  path: string
  name?: string
}

export default class GitHubProjectDetailsDataSource implements IProjectDetailsDataSource {
  private readonly graphQlClient: IGitHubGraphQLClient
  private readonly naming: ProjectRepositoryNaming
  private readonly encryptionService: IEncryptionService
  private readonly remoteConfigEncoder: IRemoteConfigEncoder

  constructor(config: {
    graphQlClient: IGitHubGraphQLClient
    repositoryNameSuffix: string
    projectConfigurationFilename: string
    encryptionService: IEncryptionService
    remoteConfigEncoder: IRemoteConfigEncoder
  }) {
    this.graphQlClient = config.graphQlClient
    this.naming = new ProjectRepositoryNaming(config)
    this.encryptionService = config.encryptionService
    this.remoteConfigEncoder = config.remoteConfigEncoder
  }

  async getProjectDetails(owner: string, repo: string): Promise<Project | null> {
    const candidateNames = this.naming.hasSuffix(repo)
      ? [repo]
      : [this.naming.suffixedName(repo), repo]

    for (const repoName of candidateNames) {
      let response: Awaited<ReturnType<typeof this.fetchRepository>>
      try {
        // Candidate names must be tried in order; the fallback only runs if the first is not found.
        // eslint-disable-next-line no-await-in-loop
        response = await this.fetchRepository(owner, repoName)
      } catch (error) {
        if (this.isNotFoundError(error)) {
          continue
        }
        throw error
      }
      if (!response.repository) {
        continue
      }

      const repository = response.repository
      // A repository found under its bare name participates only if it opted in via the
      // configuration file. This mirrors list discovery and the content-serving guard.
      if (!this.naming.hasSuffix(repository.name) && !repository.configYml && !repository.configYaml) {
        continue
      }
      const pullRequests = this.mapPullRequests(repository.pullRequests?.edges || [])

      // eslint-disable-next-line no-await-in-loop
      return await this.mapToProject({
        owner,
        name: repository.name,
        defaultBranchRef: repository.defaultBranchRef,
        configYml: repository.configYml,
        configYaml: repository.configYaml,
        branches: repository.branches?.edges?.map((e: { node: GraphQLRef }) => e.node) || [],
        tags: repository.tags?.edges?.map((e: { node: GraphQLRef }) => e.node) || [],
        pullRequests
      })
    }

    return null
  }

  private async fetchRepository(owner: string, name: string) {
    const request = {
      query: `
      query ProjectDetails($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          name
          defaultBranchRef {
            name
            target {
              ... on Commit { oid }
            }
          }
          configYml: object(expression: ${JSON.stringify(`HEAD:${this.naming.configFileYml}`)}) {
            ... on Blob { text }
          }
          configYaml: object(expression: ${JSON.stringify(`HEAD:${this.naming.configFileYaml}`)}) {
            ... on Blob { text }
          }
          branches: refs(refPrefix: "refs/heads/", first: 100) {
            edges {
              node {
                name
                target {
                  ... on Commit {
                    oid
                    tree { entries { name } }
                  }
                }
              }
            }
          }
          tags: refs(refPrefix: "refs/tags/", first: 100) {
            edges {
              node {
                name
                target {
                  ... on Commit {
                    oid
                    tree { entries { name } }
                  }
                }
              }
            }
          }
          pullRequests(first: 100, states: [OPEN]) {
            edges {
              node {
                number
                headRefName
                baseRefName
                baseRefOid
                files(first: 100) {
                  nodes { path }
                }
              }
            }
          }
        }
      }
      `,
      variables: { owner, name }
    }

    return await this.graphQlClient.graphql(request)
  }

  private mapPullRequests(edges: { node: GraphQLPullRequest }[]): Map<string, PullRequestInfo> {
    const map = new Map()
    for (const edge of edges) {
      const pr = edge.node
      map.set(pr.headRefName, {
        number: pr.number,
        baseRefName: pr.baseRefName,
        baseRefOid: pr.baseRefOid,
        changedFiles: pr.files?.nodes?.map(f => f.path) || []
      })
    }
    return map
  }

  private async mapToProject(data: {
    owner: string
    name: string
    defaultBranchRef: { name: string; target: { oid: string } }
    configYml?: { text: string }
    configYaml?: { text: string }
    branches: GraphQLRef[]
    tags: GraphQLRef[]
    pullRequests: Map<string, PullRequestInfo>
  }): Promise<Project> {
    const config = this.parseConfig(data.configYml, data.configYaml)
    const defaultName = this.naming.projectName(data.name)

    let imageURL: string | undefined
    if (config?.image) {
      imageURL = `/api/blob/${data.owner}/${data.name}/${encodeURIComponent(config.image)}?ref=${data.defaultBranchRef.target.oid}`
    }

    const specificationsForRef = await this.makeSpecificationSourceResolver(
      data.owner,
      data.name,
      [...data.branches, ...data.tags],
      config?.specifications
    )

    const branchVersions = data.branches.map(branch =>
      this.mapVersion({
        owner: data.owner,
        repoName: data.name,
        ref: branch,
        isDefault: branch.name === data.defaultBranchRef.name,
        pr: data.pullRequests.get(branch.name),
        specifications: specificationsForRef(branch)
      })
    )

    const tagVersions = data.tags.map(tag =>
      this.mapVersion({
        owner: data.owner,
        repoName: data.name,
        ref: tag,
        specifications: specificationsForRef(tag)
      })
    )

    const versions = this.sortVersions(
      this.addRemoteVersions(
        [...branchVersions, ...tagVersions],
        config?.remoteVersions || []
      ),
      data.defaultBranchRef.name
    )
    .filter(v => v.specifications.length > 0)
    .map(v => this.setDefaultSpecification(v, config?.defaultSpecificationName))

    return {
      id: `${data.owner}-${defaultName}`,
      owner: data.owner,
      name: defaultName,
      displayName: config?.name || defaultName,
      versions,
      imageURL,
      ownerUrl: `https://github.com/${data.owner}`,
      url: `https://github.com/${data.owner}/${data.name}`
    }
  }

  // Decides once per project where a version's specifications come from: the paths listed
  // in the configuration (verified to exist per ref), or a scan of the ref's root tree.
  private async makeSpecificationSourceResolver(
    owner: string,
    repoName: string,
    refs: GraphQLRef[],
    configSpecs?: ProjectConfigSpecification[]
  ): Promise<(ref: GraphQLRef) => SpecificationSource[]> {
    if (!configSpecs || configSpecs.length === 0) {
      return ref => ref.target.tree.entries
        .filter(f => this.isOpenAPISpec(f.name))
        .map(f => ({ path: f.name }))
    }
    const existenceByRefName = await this.fetchSpecExistence(
      owner,
      repoName,
      refs.map(ref => ({ name: ref.name, oid: ref.target.oid })),
      configSpecs
    )
    return ref => {
      const existingPaths = existenceByRefName.get(ref.name) ?? []
      return configSpecs.filter(spec => existingPaths.includes(spec.path))
    }
  }

  private async fetchSpecExistence(
    owner: string,
    repoName: string,
    refs: Array<{ name: string; oid: string }>,
    specs: ProjectConfigSpecification[]
  ): Promise<Map<string, string[]>> {
    if (refs.length === 0 || specs.length === 0) return new Map()

    const refsPerQuery = Math.max(1, Math.floor(MAX_SPEC_EXISTENCE_ALIASES_PER_QUERY / specs.length))
    const chunks: Array<typeof refs> = []
    for (let i = 0; i < refs.length; i += refsPerQuery) {
      chunks.push(refs.slice(i, i + refsPerQuery))
    }

    const chunkResults = await Promise.all(
      chunks.map(chunk => this.fetchSpecExistenceChunk(owner, repoName, chunk, specs))
    )
    const merged = new Map<string, string[]>()
    for (const chunkResult of chunkResults) {
      chunkResult.forEach((paths, refName) => merged.set(refName, paths))
    }
    return merged
  }

  private async fetchSpecExistenceChunk(
    owner: string,
    repoName: string,
    refs: Array<{ name: string; oid: string }>,
    specs: ProjectConfigSpecification[]
  ): Promise<Map<string, string[]>> {
    const aliases = refs.flatMap((ref, ri) =>
      specs.map((spec, si) =>
        `r${ri}s${si}: object(expression: ${JSON.stringify(`${ref.oid}:${spec.path}`)}) { ... on Blob { oid } }`
      )
    )

    const query = `
      query SpecExistence($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          ${aliases.join("\n          ")}
        }
      }
    `

    const response = await this.graphQlClient.graphql({ query, variables: { owner, name: repoName } })

    const result = new Map<string, string[]>()
    refs.forEach((ref, ri) => {
      const existingPaths: string[] = []
      specs.forEach((spec, si) => {
        const alias = `r${ri}s${si}`
        if (response.repository?.[alias] != null) {
          existingPaths.push(spec.path)
        }
      })
      result.set(ref.name, existingPaths)
    })
    return result
  }

  private parseConfig(configYml?: { text: string }, configYaml?: { text: string }): IProjectConfig | null {
    const yml = configYml || configYaml
    if (!yml?.text) return null
    const { config, error } = new ProjectConfigParser().tryParse(yml.text)
    if (error) {
      // A broken config should degrade to default behavior, not fail the project page.
      console.error(`Ignoring invalid project config: ${error}`)
    }
    return config
  }

  private mapVersion(params: {
    owner: string
    repoName: string
    ref: GraphQLRef
    isDefault?: boolean
    pr?: PullRequestInfo
    specifications: SpecificationSource[]
  }): Version {
    const { owner, repoName, ref, isDefault, pr } = params

    const specifications = params.specifications
      .map(spec => this.makeSpecification({
        owner,
        repoName,
        refName: ref.name,
        refOid: ref.target.oid,
        path: spec.path,
        name: spec.name,
        pr
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return {
      id: ref.name,
      name: ref.name,
      specifications,
      url: `https://github.com/${owner}/${repoName}/tree/${ref.name}`,
      isDefault: isDefault || false
    }
  }

  private makeSpecification(params: {
    owner: string
    repoName: string
    refName: string
    refOid: string
    path: string
    name?: string
    pr?: PullRequestInfo
  }) {
    const { owner, repoName, refName, refOid, path, name, pr } = params
    const isChanged = pr?.changedFiles.includes(path) ?? false
    return {
      id: path,
      name: name ?? path,
      url: `/api/blob/${owner}/${repoName}/${encodeURIComponent(path)}?ref=${refOid}`,
      editURL: `https://github.com/${owner}/${repoName}/edit/${refName}/${encodeURIComponent(path)}`,
      diffURL: isChanged ? `/api/diff/${owner}/${repoName}/${encodeURIComponent(path)}?baseRefOid=${pr!.baseRefOid}&to=${refOid}` : undefined,
      diffBaseBranch: isChanged ? pr!.baseRefName : undefined,
      diffBaseOid: isChanged ? pr!.baseRefOid : undefined,
      diffPrUrl: isChanged ? `https://github.com/${owner}/${repoName}/pull/${pr!.number}` : undefined,
      isDefault: false
    }
  }

  private isOpenAPISpec(filename: string): boolean {
    return !filename.startsWith(".") && (filename.endsWith(".yml") || filename.endsWith(".yaml"))
  }

  private sortVersions(versions: Version[], defaultBranchName: string): Version[] {
    const priority = [defaultBranchName, "main", "master", "develop", "development", "trunk"].reverse()
    const sorted = [...versions].sort((a, b) => a.name.localeCompare(b.name))

    for (const branch of priority) {
      const idx = sorted.findIndex(v => v.name === branch)
      if (idx !== -1) {
        const [version] = sorted.splice(idx, 1)
        sorted.unshift(version)
      }
    }
    return sorted
  }

  private addRemoteVersions(versions: Version[], remoteVersions: ProjectConfigRemoteVersion[]): Version[] {
    const result = [...versions]
    const ids = result.map(v => v.id)

    for (const rv of remoteVersions) {
      const baseId = this.makeURLSafeID((rv.id || rv.name).toLowerCase())
      const count = ids.filter(id => id === baseId).length
      const versionId = baseId + (count > 0 ? count : "")

      const specifications = rv.specifications.map(spec => {
        const remoteConfig: RemoteConfig = {
          url: spec.url,
          auth: this.tryDecryptAuth(spec)
        }
        const encoded = this.remoteConfigEncoder.encode(remoteConfig)
        const hash = createHash("sha256").update(JSON.stringify(remoteConfig)).digest("hex").slice(0, 16)

        return {
          id: this.makeURLSafeID((spec.id || spec.name).toLowerCase()),
          name: spec.name,
          url: `/api/remotes/${encoded}`,
          urlHash: hash,
          isDefault: false
        }
      })

      result.push({ id: versionId, name: rv.name, specifications, isDefault: false })
      ids.push(baseId)
    }

    return result
  }

  private makeURLSafeID(str: string): string {
    return str.replace(/ /g, "-").replace(/[^A-Za-z0-9-]/g, "")
  }

  private tryDecryptAuth(spec: ProjectConfigRemoteSpecification) {
    if (!spec.auth) return undefined
    try {
      return {
        type: spec.auth.type,
        username: this.encryptionService.decrypt(spec.auth.encryptedUsername),
        password: this.encryptionService.decrypt(spec.auth.encryptedPassword)
      }
    } catch (error) {
      console.info(`Failed to decrypt remote specification auth for ${spec.name} (${spec.url}). Perhaps a different public key was used?:`, error)
      return undefined
    }
  }

  private setDefaultSpecification(version: Version, defaultName?: string): Version {
    return {
      ...version,
      specifications: version.specifications.map(spec => ({
        ...spec,
        isDefault: spec.name === defaultName
      }))
    }
  }

  private isNotFoundError(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    const anyError = error as { type?: string; errors?: { type?: string }[] }
    if (anyError.type === "NOT_FOUND") return true
    if (anyError.errors?.some(e => e.type === "NOT_FOUND")) return true
    return false
  }
}
