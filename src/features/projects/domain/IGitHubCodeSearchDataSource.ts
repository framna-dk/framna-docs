export type CodeSearchRepository = {
  readonly owner: string
  readonly name: string
}

export default interface IGitHubCodeSearchDataSource {
  searchRepositoriesContainingFile(query: string): Promise<CodeSearchRepository[]>
}
