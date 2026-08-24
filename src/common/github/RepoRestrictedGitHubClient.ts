import IGitHubClient, {
    AddCommentToPullRequestRequest,
    GetPullRequestCommentsRequest,
    GetPullRequestFilesRequest,
    GetRepositoryContentRequest,
    GraphQLQueryRequest,
    GraphQlQueryResponse,
    PullRequestComment,
    PullRequestFile,
    RepositoryContent,
    UpdatePullRequestCommentRequest,
    CompareCommitsRequest,
    CompareCommitsResponse,
    CodeSearchResult
} from "./IGitHubClient";
import ProjectRepositoryNaming from "../utils/ProjectRepositoryNaming";

// Deliberately stateless: this instance is shared across users while every call runs with
// the requesting user's token, so nothing observed on behalf of one user may be kept around
// to answer for another.
export class RepoRestrictedGitHubClient implements IGitHubClient {

    private gitHubClient: IGitHubClient;
    private naming: ProjectRepositoryNaming;

    constructor(config: {
        repositoryNameSuffix: string;
        projectConfigurationFilename: string;
        gitHubClient: IGitHubClient
    }) {
        this.gitHubClient = config.gitHubClient;
        this.naming = new ProjectRepositoryNaming(config);
    }

    graphql(request: GraphQLQueryRequest): Promise<GraphQlQueryResponse> {
        return this.gitHubClient.graphql(request);
    }

    async getRepositoryContent(request: GetRepositoryContentRequest): Promise<RepositoryContent> {
        await this.ensureRepositoryAllowed(request.repositoryOwner, request.repositoryName);
        return this.gitHubClient.getRepositoryContent(request);
    }

    async getPullRequestFiles(request: GetPullRequestFilesRequest): Promise<PullRequestFile[]> {
        await this.ensureRepositoryAllowed(request.repositoryOwner, request.repositoryName);
        return this.gitHubClient.getPullRequestFiles(request);
    }

    async getPullRequestComments(request: GetPullRequestCommentsRequest): Promise<PullRequestComment[]> {
        await this.ensureRepositoryAllowed(request.repositoryOwner, request.repositoryName);
        return this.gitHubClient.getPullRequestComments(request);
    }

    async addCommentToPullRequest(request: AddCommentToPullRequestRequest): Promise<void> {
        await this.ensureRepositoryAllowed(request.repositoryOwner, request.repositoryName);
        return this.gitHubClient.addCommentToPullRequest(request);
    }

    async updatePullRequestComment(request: UpdatePullRequestCommentRequest): Promise<void> {
        await this.ensureRepositoryAllowed(request.repositoryOwner, request.repositoryName);
        return this.gitHubClient.updatePullRequestComment(request);
    }

    async compareCommitsWithBasehead(request: CompareCommitsRequest): Promise<CompareCommitsResponse> {
        await this.ensureRepositoryAllowed(request.repositoryOwner, request.repositoryName);
        return this.gitHubClient.compareCommitsWithBasehead(request);
    }

    searchCode(query: string): Promise<CodeSearchResult[]> {
        return this.gitHubClient.searchCode(query);
    }

    // A repository is served only if it opted in to Framna Docs: either its name carries the
    // suffix, or it contains the project configuration file. This mirrors project discovery
    // and keeps the portal from proxying content of arbitrary repositories.
    private async ensureRepositoryAllowed(owner: string, name: string): Promise<void> {
        if (this.naming.hasSuffix(name)) return;
        if (await this.containsProjectConfigurationFile(owner, name)) return;
        throw new Error("Invalid repository name");
    }

    private async containsProjectConfigurationFile(owner: string, name: string): Promise<boolean> {
        for (const filename of this.naming.configFileVariants) {
            // Variants are probed sequentially so the common .yml case skips the .yaml request.
            // eslint-disable-next-line no-await-in-loop
            if (await this.configurationFileExists(owner, name, filename)) {
                return true;
            }
        }
        return false;
    }

    private async configurationFileExists(owner: string, name: string, path: string): Promise<boolean> {
        try {
            await this.gitHubClient.getRepositoryContent({
                repositoryOwner: owner,
                repositoryName: name,
                path,
                ref: undefined
            });
            return true;
        } catch (error) {
            if (isNotFoundError(error)) {
                return false;
            }
            // Rate limits, auth failures and the like must surface as what they are,
            // not read as "this repository did not opt in".
            throw error;
        }
    }
}

function isNotFoundError(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { status?: number }).status === 404;
}
