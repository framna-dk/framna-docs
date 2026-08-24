import {
    IGitHubClient,
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
} from "@/common";

const CONFIG_FILE_CHECK_TTL_MS = 5 * 60 * 1000

export class RepoRestrictedGitHubClient implements IGitHubClient {

    private gitHubClient: IGitHubClient;
    private repositoryNameSuffix: string;
    private projectConfigurationFilename: string;
    private configFileChecks = new Map<string, { allowed: boolean; expiresAt: number }>();

    constructor(config: {
        repositoryNameSuffix: string;
        projectConfigurationFilename: string;
        gitHubClient: IGitHubClient
    }) {
        this.gitHubClient = config.gitHubClient;
        this.repositoryNameSuffix = config.repositoryNameSuffix;
        this.projectConfigurationFilename = config.projectConfigurationFilename.replace(/\.ya?ml$/, "");
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
        if (name.endsWith(this.repositoryNameSuffix)) return;
        if (await this.containsProjectConfigurationFile(owner, name)) return;
        throw new Error("Invalid repository name");
    }

    private async containsProjectConfigurationFile(owner: string, name: string): Promise<boolean> {
        const key = `${owner}/${name}`;
        const cached = this.configFileChecks.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.allowed;
        }
        const allowed = await this.configurationFileExists(owner, name, ".yml")
            || await this.configurationFileExists(owner, name, ".yaml");
        this.configFileChecks.set(key, { allowed, expiresAt: Date.now() + CONFIG_FILE_CHECK_TTL_MS });
        return allowed;
    }

    private async configurationFileExists(owner: string, name: string, extension: string): Promise<boolean> {
        try {
            await this.gitHubClient.getRepositoryContent({
                repositoryOwner: owner,
                repositoryName: name,
                path: `${this.projectConfigurationFilename}${extension}`,
                ref: undefined
            });
            return true;
        } catch {
            return false;
        }
    }
}
