import { RepoRestrictedGitHubClient } from '@/common/github/RepoRestrictedGitHubClient';
import {
    IGitHubClient,
    AddCommentToPullRequestRequest,
    GetPullRequestCommentsRequest,
    GetPullRequestFilesRequest,
    GetRepositoryContentRequest,
    GraphQLQueryRequest,
    UpdatePullRequestCommentRequest,
} from "@/common";
import { jest } from '@jest/globals';

describe('RepoRestrictedGitHubClient', () => {
    let client: RepoRestrictedGitHubClient;
    const repositoryNameSuffix = '-suffix';

    const gitHubClient: jest.Mocked<IGitHubClient> = {
        graphql: jest.fn(),
        getRepositoryContent: jest.fn(),
        getPullRequestFiles: jest.fn(),
        getPullRequestComments: jest.fn(),
        addCommentToPullRequest: jest.fn(),
        updatePullRequestComment: jest.fn(),
        compareCommitsWithBasehead: jest.fn(),
        listRepositoriesForAuthenticatedUser: jest.fn(),
    };

    const notFoundError = () => Object.assign(new Error("Not Found"), { status: 404 });

    beforeEach(() => {
        jest.clearAllMocks();
        // Default: repositories do not contain the project configuration file.
        gitHubClient.getRepositoryContent.mockRejectedValue(notFoundError());
        client = new RepoRestrictedGitHubClient({
            repositoryNameSuffix,
            projectConfigurationFilename: '.framna-docs.yml',
            gitHubClient
        });
    });

    it('should delegate graphql request to the underlying client', async () => {
        const request: GraphQLQueryRequest = { query: '' };
        await client.graphql(request);
        expect(gitHubClient.graphql).toHaveBeenCalledWith(request);
    });

    it('should delegate getRepositoryContent to the underlying client', async () => {
        gitHubClient.getRepositoryContent.mockResolvedValue({ downloadURL: '' });
        const request: GetRepositoryContentRequest = {
            repositoryName: 'repo-suffix', path: '',
            repositoryOwner: '',
            ref: undefined
        };
        await client.getRepositoryContent(request);
        expect(gitHubClient.getRepositoryContent).toHaveBeenCalledWith(request);
    });

    it('should throw error if suffix is invalid for getRepositoryContent', async () => {
        const request: GetRepositoryContentRequest = {
            repositoryName: 'repo', path: '',
            repositoryOwner: '',
            ref: undefined
        };
        await expect(client.getRepositoryContent(request)).rejects.toThrow("Invalid repository name");
    });

    it('should allow repository without suffix when it contains the project configuration file', async () => {
        gitHubClient.getRepositoryContent.mockResolvedValue({ downloadURL: '' });
        const request: GetRepositoryContentRequest = {
            repositoryName: 'monorepo', path: 'docs/openapi.yml',
            repositoryOwner: 'acme',
            ref: undefined
        };
        await client.getRepositoryContent(request);
        expect(gitHubClient.getRepositoryContent).toHaveBeenCalledWith(expect.objectContaining({
            repositoryOwner: 'acme',
            repositoryName: 'monorepo',
            path: '.framna-docs.yml'
        }));
        expect(gitHubClient.getRepositoryContent).toHaveBeenCalledWith(request);
    });

    it('should check for a .yaml configuration file when the .yml variant is missing', async () => {
        gitHubClient.getRepositoryContent.mockImplementation(async req => {
            if (req.path === '.framna-docs.yaml' || req.path === 'docs/openapi.yml') {
                return { downloadURL: '' }
            }
            throw Object.assign(new Error("Not Found"), { status: 404 })
        });
        const request: GetRepositoryContentRequest = {
            repositoryName: 'monorepo', path: 'docs/openapi.yml',
            repositoryOwner: 'acme',
            ref: undefined
        };
        await client.getRepositoryContent(request);
        expect(gitHubClient.getRepositoryContent).toHaveBeenCalledWith(request);
    });

    it('should check the configuration file on every request with the requesting user\'s token', async () => {
        // The client instance is shared across users while probes run with the requesting
        // user's token, so results are never cached: one user's observation must not answer
        // for another.
        gitHubClient.getRepositoryContent.mockResolvedValue({ downloadURL: '' });
        const request: GetRepositoryContentRequest = {
            repositoryName: 'monorepo', path: 'docs/openapi.yml',
            repositoryOwner: 'acme',
            ref: undefined
        };
        await client.getRepositoryContent(request);
        await client.getRepositoryContent(request);
        const configChecks = gitHubClient.getRepositoryContent.mock.calls
            .filter(call => call[0].path === '.framna-docs.yml')
        expect(configChecks).toHaveLength(2);
    });

    it('should surface non-404 errors from the configuration file check instead of denying', async () => {
        gitHubClient.getRepositoryContent.mockRejectedValue(
            Object.assign(new Error("API rate limit exceeded"), { status: 403 })
        );
        const request: GetRepositoryContentRequest = {
            repositoryName: 'monorepo', path: 'docs/openapi.yml',
            repositoryOwner: 'acme',
            ref: undefined
        };
        await expect(client.getRepositoryContent(request)).rejects.toThrow("API rate limit exceeded");
    });

    it('should delegate getPullRequestFiles to the underlying client', async () => {
        const request: GetPullRequestFilesRequest = {
            repositoryName: 'repo-suffix', pullRequestNumber: 1,
            appInstallationId: 0,
            repositoryOwner: ''
        };
        await client.getPullRequestFiles(request);
        expect(gitHubClient.getPullRequestFiles).toHaveBeenCalledWith(request);
    });

    it('should throw error if suffix is invalid for getPullRequestFiles', async () => {
        const request: GetPullRequestFilesRequest = {
            repositoryName: 'repo', pullRequestNumber: 1,
            appInstallationId: 0,
            repositoryOwner: ''
        };
        await expect(client.getPullRequestFiles(request)).rejects.toThrow("Invalid repository name");
    });

    it('should delegate getPullRequestComments to the underlying client', async () => {
        const request: GetPullRequestCommentsRequest = {
            repositoryName: 'repo-suffix', pullRequestNumber: 1,
            appInstallationId: 0,
            repositoryOwner: ''
        };
        await client.getPullRequestComments(request);
        expect(gitHubClient.getPullRequestComments).toHaveBeenCalledWith(request);
    });

    it('should throw error if suffix is invalid for getPullRequestComments', async () => {
        const request: GetPullRequestCommentsRequest = {
            repositoryName: 'repo', pullRequestNumber: 1,
            appInstallationId: 0,
            repositoryOwner: ''
        };
        await expect(client.getPullRequestComments(request)).rejects.toThrow("Invalid repository name");
    });

    it('should delegate addCommentToPullRequest to the underlying client', async () => {
        const request: AddCommentToPullRequestRequest = {
            repositoryName: 'repo-suffix', pullRequestNumber: 1, body: '',
            appInstallationId: 0,
            repositoryOwner: ''
        };
        await client.addCommentToPullRequest(request);
        expect(gitHubClient.addCommentToPullRequest).toHaveBeenCalledWith(request);
    });

    it('should throw error if suffix is invalid for addCommentToPullRequest', async () => {
        const request: AddCommentToPullRequestRequest = {
            repositoryName: 'repo', pullRequestNumber: 1, body: '',
            appInstallationId: 0,
            repositoryOwner: ''
        };
        await expect(client.addCommentToPullRequest(request)).rejects.toThrow("Invalid repository name");
    });

    it('should delegate updatePullRequestComment to the underlying client', async () => {
        const request: UpdatePullRequestCommentRequest = {
            repositoryName: 'repo-suffix', commentId: 1, body: '',
            appInstallationId: 0,
            repositoryOwner: ''
        };
        await client.updatePullRequestComment(request);
        expect(gitHubClient.updatePullRequestComment).toHaveBeenCalledWith(request);
    });

    it('should throw error if suffix is invalid for updatePullRequestComment', async () => {
        const request: UpdatePullRequestCommentRequest = {
            repositoryName: 'repo', commentId: 1, body: '',
            appInstallationId: 0,
            repositoryOwner: ''
        };
        await expect(client.updatePullRequestComment(request)).rejects.toThrow("Invalid repository name");
    });
});
