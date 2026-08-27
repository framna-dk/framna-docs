export type AccessibleRepositoryRef = {
  readonly owner: string
  readonly name: string
  readonly pushedAt: string | null
}

export default interface IGitHubAccessibleRepositoriesDataSource {
  getAccessibleRepositories(): Promise<AccessibleRepositoryRef[]>
}
