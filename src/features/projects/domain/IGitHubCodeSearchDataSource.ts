export type CodeSearchRepository = {
  readonly owner: string
  readonly name: string
  readonly isPrivate: boolean
}

export default interface IGitHubCodeSearchDataSource {
  searchRepositoriesContainingFile(query: string): Promise<CodeSearchRepository[]>
}
