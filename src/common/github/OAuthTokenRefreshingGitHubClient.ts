import { z } from "zod"
import IGitHubClient, {
  GraphQLQueryRequest,
  GraphQlQueryResponse,
  GetRepositoryContentRequest,
  GetPullRequestCommentsRequest,
  AddCommentToPullRequestRequest,
  UpdatePullRequestCommentRequest,
  GetPullRequestFilesRequest,
  CompareCommitsRequest,
  CompareCommitsResponse,
  RepositoryContent,
  PullRequestComment,
  PullRequestFile,
  AccessibleRepository
} from "./IGitHubClient"

const HttpErrorSchema = z.object({
  status: z.number()
})

type OAuthToken = { accessToken: string, refreshToken?: string }

interface IGitHubOAuthTokenDataSource {
  getOAuthToken(): Promise<OAuthToken>
}

interface IGitHubOAuthTokenRefresher {
  refreshOAuthToken(oauthToken: OAuthToken): Promise<OAuthToken>
}

export default class OAuthTokenRefreshingGitHubClient implements IGitHubClient {
  private readonly oauthTokenDataSource: IGitHubOAuthTokenDataSource
  private readonly oauthTokenRefresher: IGitHubOAuthTokenRefresher
  private readonly gitHubClient: IGitHubClient
  
  constructor(config: {
    oauthTokenDataSource: IGitHubOAuthTokenDataSource
    oauthTokenRefresher: IGitHubOAuthTokenRefresher
    gitHubClient: IGitHubClient
  }) {
    this.oauthTokenDataSource = config.oauthTokenDataSource
    this.oauthTokenRefresher = config.oauthTokenRefresher
    this.gitHubClient = config.gitHubClient
  }
  
  async graphql(request: GraphQLQueryRequest): Promise<GraphQlQueryResponse> {
    return await this.send(async () => {
      return await this.gitHubClient.graphql(request)
    })
  }
  
  async getRepositoryContent(request: GetRepositoryContentRequest): Promise<RepositoryContent> {
    return await this.send(async () => {
      return await this.gitHubClient.getRepositoryContent(request)
    })
  }
  
  async getPullRequestFiles(request: GetPullRequestFilesRequest): Promise<PullRequestFile[]> {
    return await this.send(async () => {
      return await this.gitHubClient.getPullRequestFiles(request)
    })
  }
  
  async getPullRequestComments(request: GetPullRequestCommentsRequest): Promise<PullRequestComment[]> {
    return await this.send(async () => {
      return await this.gitHubClient.getPullRequestComments(request)
    })
  }
  
  async addCommentToPullRequest(request: AddCommentToPullRequestRequest) {
    return await this.send(async () => {
      return await this.gitHubClient.addCommentToPullRequest(request)
    })
  }
  
  async updatePullRequestComment(request: UpdatePullRequestCommentRequest) {
    return await this.send(async () => {
      return await this.gitHubClient.updatePullRequestComment(request)
    })
  }

  async compareCommitsWithBasehead(request: CompareCommitsRequest): Promise<CompareCommitsResponse> {
    return await this.send(async () => {
      return await this.gitHubClient.compareCommitsWithBasehead(request)
    })
  }

  async listRepositoriesForAuthenticatedUser(): Promise<AccessibleRepository[]> {
    return await this.send(async () => {
      return await this.gitHubClient.listRepositoriesForAuthenticatedUser()
    })
  }

  private async send<T>(fn: () => Promise<T>): Promise<T> {
    const oauthToken = await this.oauthTokenDataSource.getOAuthToken()
    try {
      return await fn()
    } catch (e) {
      try {
        const error = HttpErrorSchema.parse(e)
        if (error.status == 401) {
          // Refresh access token and try the request one last time.
          await this.oauthTokenRefresher.refreshOAuthToken(oauthToken)
          return await fn()
        } else {
          // Not an error we can handle so forward it.
          throw e
        }
      } catch {
        // Forward the original error if schema validation fails.
        throw e
      }
    }
  }
}
