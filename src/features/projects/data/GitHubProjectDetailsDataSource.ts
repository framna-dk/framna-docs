import { createHash } from "crypto"
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

export default class GitHubProjectDetailsDataSource implements IProjectDetailsDataSource {
  private readonly graphQlClient: IGitHubGraphQLClient
  private readonly repositoryNameSuffix: string
  private readonly projectConfigurationFilename: string
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
    this.repositoryNameSuffix = config.repositoryNameSuffix
    this.projectConfigurationFilename = config.projectConfigurationFilename.replace(/\.ya?ml$/, "")
    this.encryptionService = config.encryptionService
    this.remoteConfigEncoder = config.remoteConfigEncoder
  }

  async getProjectDetails(owner: string, repo: string): Promise<Project | null> {
    const candidateNames = [
      repo.endsWith(this.repositoryNameSuffix) ? repo : `${repo}${this.repositoryNameSuffix}`
    ]
    if (!repo.endsWith(this.repositoryNameSuffix)) {
      candidateNames.push(repo)
    }

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
          configYml: object(expression: "HEAD:${this.projectConfigurationFilename}.yml") {
            ... on Blob { text }
          }
          configYaml: object(expression: "HEAD:${this.projectConfigurationFilename}.yaml") {
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

  private mapPullRequests(edges: { node: GraphQLPullRequest }[]): Map<string, {
    number: number
    baseRefName: string
    baseRefOid: string
    changedFiles: string[]
  }> {
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
    pullRequests: Map<string, { number: number; baseRefName: string; baseRefOid: string; changedFiles: string[] }>
  }): Promise<Project> {
    const config = this.parseConfig(data.configYml, data.configYaml)
    const defaultName = data.name.replace(new RegExp(this.repositoryNameSuffix + "$"), "")

    let imageURL: string | undefined
    if (config?.image) {
      imageURL = `/api/blob/${data.owner}/${data.name}/${encodeURIComponent(config.image)}?ref=${data.defaultBranchRef.target.oid}`
    }

    const allRefs = [
      ...data.branches.map(ref => ({ name: ref.name, oid: ref.target.oid })),
      ...data.tags.map(ref => ({ name: ref.name, oid: ref.target.oid }))
    ]

    let specExistenceMap: Map<string, string[]> | null = null
    if (config?.specifications && config.specifications.length > 0) {
      specExistenceMap = await this.fetchSpecExistence(
        data.owner,
        data.name,
        allRefs,
        config.specifications
      )
    }

    const branchVersions = data.branches.map(branch => {
      const pr = data.pullRequests.get(branch.name)
      return this.mapVersion({
        owner: data.owner,
        repoName: data.name,
        ref: branch,
        isDefault: branch.name === data.defaultBranchRef.name,
        pr,
        configSpecs: config?.specifications,
        existingSpecPaths: specExistenceMap?.get(branch.name)
      })
    })

    const tagVersions = data.tags.map(tag =>
      this.mapVersion({
        owner: data.owner,
        repoName: data.name,
        ref: tag,
        configSpecs: config?.specifications,
        existingSpecPaths: specExistenceMap?.get(tag.name)
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

  private async fetchSpecExistence(
    owner: string,
    repoName: string,
    refs: Array<{ name: string; oid: string }>,
    specs: ProjectConfigSpecification[]
  ): Promise<Map<string, string[]>> {
    if (refs.length === 0 || specs.length === 0) return new Map()

    const aliases = refs.flatMap((ref, ri) =>
      specs.map((spec, si) =>
        `r${ri}s${si}: object(expression: "${ref.oid}:${spec.path}") { ... on Blob { oid } }`
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
    try {
      return new ProjectConfigParser().parse(yml.text)
    } catch (error) {
      // A broken config should degrade to default behavior, not fail the project page.
      console.error("Ignoring invalid project config:", error)
      return null
    }
  }

  private mapVersion(params: {
    owner: string
    repoName: string
    ref: GraphQLRef
    isDefault?: boolean
    pr?: { number: number; baseRefName: string; baseRefOid: string; changedFiles: string[] }
    configSpecs?: ProjectConfigSpecification[]
    existingSpecPaths?: string[]
  }): Version {
    const { owner, repoName, ref, isDefault, pr, configSpecs, existingSpecPaths } = params

    let specifications
    if (configSpecs && existingSpecPaths) {
      specifications = configSpecs
        .filter(spec => existingSpecPaths.includes(spec.path))
        .map(spec => this.makeSpecFromPath({
          owner,
          repoName,
          refName: ref.name,
          refOid: ref.target.oid,
          specPath: spec.path,
          specName: spec.name,
          pr
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    } else {
      specifications = ref.target.tree.entries
        .filter(f => this.isOpenAPISpec(f.name))
        .map(file => {
          const isChanged = pr?.changedFiles.includes(file.name) ?? false
          return {
            id: file.name,
            name: file.name,
            url: `/api/blob/${owner}/${repoName}/${encodeURIComponent(file.name)}?ref=${ref.target.oid}`,
            editURL: `https://github.com/${owner}/${repoName}/edit/${ref.name}/${encodeURIComponent(file.name)}`,
            diffURL: isChanged ? `/api/diff/${owner}/${repoName}/${encodeURIComponent(file.name)}?baseRefOid=${pr!.baseRefOid}&to=${ref.target.oid}` : undefined,
            diffBaseBranch: isChanged ? pr!.baseRefName : undefined,
            diffBaseOid: isChanged ? pr!.baseRefOid : undefined,
            diffPrUrl: isChanged ? `https://github.com/${owner}/${repoName}/pull/${pr!.number}` : undefined,
            isDefault: false
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    }

    return {
      id: ref.name,
      name: ref.name,
      specifications,
      url: `https://github.com/${owner}/${repoName}/tree/${ref.name}`,
      isDefault: isDefault || false
    }
  }

  private makeSpecFromPath(params: {
    owner: string
    repoName: string
    refName: string
    refOid: string
    specPath: string
    specName?: string
    pr?: { number: number; baseRefName: string; baseRefOid: string; changedFiles: string[] }
  }) {
    const { owner, repoName, refName, refOid, specPath, specName, pr } = params
    const isChanged = pr?.changedFiles.includes(specPath) ?? false
    return {
      id: specPath,
      name: specName || specPath,
      url: `/api/blob/${owner}/${repoName}/${encodeURIComponent(specPath)}?ref=${refOid}`,
      editURL: `https://github.com/${owner}/${repoName}/edit/${refName}/${encodeURIComponent(specPath)}`,
      diffURL: isChanged ? `/api/diff/${owner}/${repoName}/${encodeURIComponent(specPath)}?baseRefOid=${pr!.baseRefOid}&to=${refOid}` : undefined,
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
