import IGitHubCodeSearchDataSource, { CodeSearchRepository } from "../domain/IGitHubCodeSearchDataSource"

interface ICodeSearchClient {
  searchCode(query: string): Promise<Array<{ repository: { owner: { login: string }; name: string } }>>
}

export default class GitHubCodeSearchDataSource implements IGitHubCodeSearchDataSource {
  private readonly client: ICodeSearchClient

  constructor(client: ICodeSearchClient) {
    this.client = client
  }

  async searchRepositoriesContainingFile(query: string): Promise<CodeSearchRepository[]> {
    const results = await this.client.searchCode(query)
    return results.map(item => ({
      owner: item.repository.owner.login,
      name: item.repository.name
    }))
  }
}
