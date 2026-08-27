import { OasDiffCalculator } from "../../src/features/diff/data/OasDiffCalculator"
import IGitHubClient from "../../src/common/github/IGitHubClient"

const createMockGitHubClient = (
    baseUrl: string,
    headUrl: string,
    mergeBaseSha = "abc123"
): IGitHubClient => ({
    async compareCommitsWithBasehead() {
        return { mergeBaseSha }
    },
    async getRepositoryContent(request) {
        if (request.ref === mergeBaseSha) {
            return { downloadURL: baseUrl }
        }
        return { downloadURL: headUrl }
    },
    async graphql() {
        return {}
    },
    async getPullRequestFiles() {
        return []
    },
    async getPullRequestComments() {
        return []
    },
    async addCommentToPullRequest() {},
    async updatePullRequestComment() {},
    async listRepositoriesForAuthenticatedUser() {
        return []
    }
})

test("It rejects non-GitHub URLs for base spec", async () => {
    const mockGitHubClient = createMockGitHubClient(
        "https://malicious-site.com/file.yaml",
        "https://raw.githubusercontent.com/owner/repo/main/file.yaml"
    )
    const calculator = new OasDiffCalculator(mockGitHubClient)

    await expect(
        calculator.calculateDiff("owner", "repo", "path.yaml", "base", "head")
    ).rejects.toThrow("Invalid URL for base spec")
})

test("It rejects invalid URLs", async () => {
    const mockGitHubClient = createMockGitHubClient(
        "not-a-valid-url",
        "https://raw.githubusercontent.com/owner/repo/main/file.yaml"
    )
    const calculator = new OasDiffCalculator(mockGitHubClient)

    await expect(
        calculator.calculateDiff("owner", "repo", "path.yaml", "base", "head")
    ).rejects.toThrow("Invalid URL for base spec")
})

test("It accepts raw.githubusercontent.com URLs", async () => {
    const mockGitHubClient = createMockGitHubClient(
        "https://raw.githubusercontent.com/owner/repo/main/file1.yaml",
        "https://raw.githubusercontent.com/owner/repo/main/file2.yaml"
    )
    const calculator = new OasDiffCalculator(mockGitHubClient)

    // This will fail when trying to execute oasdiff, but that's expected
    // We're only testing that URL validation passes
    await expect(
        calculator.calculateDiff("owner", "repo", "path.yaml", "base", "head")
    ).rejects.toThrow("Failed to execute OpenAPI diff tool")
})

test("It accepts github.com URLs", async () => {
    const mockGitHubClient = createMockGitHubClient(
        "https://github.com/owner/repo/raw/main/file1.yaml",
        "https://github.com/owner/repo/raw/main/file2.yaml"
    )
    const calculator = new OasDiffCalculator(mockGitHubClient)

    // This will fail when trying to execute oasdiff, but that's expected
    // We're only testing that URL validation passes
    await expect(
        calculator.calculateDiff("owner", "repo", "path.yaml", "base", "head")
    ).rejects.toThrow("Failed to execute OpenAPI diff tool")
})

test("It accepts api.github.com URLs", async () => {
    const mockGitHubClient = createMockGitHubClient(
        "https://api.github.com/repos/owner/repo/contents/file1.yaml",
        "https://api.github.com/repos/owner/repo/contents/file2.yaml"
    )
    const calculator = new OasDiffCalculator(mockGitHubClient)

    // This will fail when trying to execute oasdiff, but that's expected
    // We're only testing that URL validation passes
    await expect(
        calculator.calculateDiff("owner", "repo", "path.yaml", "base", "head")
    ).rejects.toThrow("Failed to execute OpenAPI diff tool")
})

test("It rejects URLs with GitHub-like subdomains but different domains", async () => {
    const mockGitHubClient = createMockGitHubClient(
        "https://raw.githubusercontent.com.evil.com/file.yaml",
        "https://raw.githubusercontent.com/owner/repo/main/file.yaml"
    )
    const calculator = new OasDiffCalculator(mockGitHubClient)

    await expect(
        calculator.calculateDiff("owner", "repo", "path.yaml", "base", "head")
    ).rejects.toThrow("Invalid URL for base spec")
})

test("It validates both base and head URLs", async () => {
    const mockGitHubClient = createMockGitHubClient(
        "https://raw.githubusercontent.com/owner/repo/main/file1.yaml",
        "https://malicious-site.com/file.yaml"
    )
    const calculator = new OasDiffCalculator(mockGitHubClient)

    await expect(
        calculator.calculateDiff("owner", "repo", "path.yaml", "base", "head")
    ).rejects.toThrow("Invalid URL for head spec")
})

test("It returns empty changes when comparing same refs", async () => {
    const mockGitHubClient = createMockGitHubClient(
        "https://raw.githubusercontent.com/owner/repo/main/file1.yaml",
        "https://raw.githubusercontent.com/owner/repo/main/file2.yaml",
        "abc123"
    )
    const calculator = new OasDiffCalculator(mockGitHubClient)

    const result = await calculator.calculateDiff(
        "owner",
        "repo",
        "path.yaml",
        "abc123",
        "abc123"
    )

    expect(result).toEqual({
        from: "abc123",
        to: "abc123",
        changes: []
    })
})
