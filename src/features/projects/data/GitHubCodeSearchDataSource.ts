import { IGitHubClient } from "@/common"
import IGitHubCodeSearchDataSource, { CodeSearchRepository } from "../domain/IGitHubCodeSearchDataSource"

type ICodeSearchClient = Pick<IGitHubClient, "searchCode">

export default class GitHubCodeSearchDataSource implements IGitHubCodeSearchDataSource {
  private readonly client: ICodeSearchClient

  constructor(client: ICodeSearchClient) {
    this.client = client
  }

  // Code search does not support the is:private/is:public qualifiers (they silently match
  // nothing), and per-login user: scoping cannot be trusted because org enumeration may be
  // unavailable to the token. Search globally: results contain every repo the token can
  // access plus public matches from anywhere; callers filter by ownership and visibility.
  async searchRepositoriesContainingFile(filename: string): Promise<CodeSearchRepository[]> {
    const results = await this.client.searchCode(`filename:${filename}`)
    return results.map(item => ({
      owner: item.repository.owner.login,
      name: item.repository.name,
      isPrivate: item.repository.private
    }))
  }
}
