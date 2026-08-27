import { IGitHubClient } from "@/common"
import IGitHubAccessibleRepositoriesDataSource, { AccessibleRepositoryRef } from "../domain/IGitHubAccessibleRepositoriesDataSource"

type IRepositoryListingClient = Pick<IGitHubClient, "listRepositoriesForAuthenticatedUser">

export default class GitHubAccessibleRepositoriesDataSource implements IGitHubAccessibleRepositoriesDataSource {
  private readonly client: IRepositoryListingClient

  constructor(client: IRepositoryListingClient) {
    this.client = client
  }

  async getAccessibleRepositories(): Promise<AccessibleRepositoryRef[]> {
    return await this.client.listRepositoriesForAuthenticatedUser()
  }
}
