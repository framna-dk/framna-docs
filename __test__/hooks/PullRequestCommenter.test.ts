import { PullRequestCommenter } from "@/features/hooks/domain"
import { jest } from "@jest/globals"
import type { IGitHubClient, PullRequestFile } from "@/common"

function configuredCommenter(config: { text?: string; variant?: "configYml" | "configYaml"; files: PullRequestFile[]; existingBody?: string }) {
  const client = {
    graphql: jest.fn<IGitHubClient["graphql"]>().mockResolvedValue({
      repository: config.text === undefined ? {} : { [config.variant ?? "configYml"]: { text: config.text } }
    }),
    getPullRequestFiles: jest.fn<IGitHubClient["getPullRequestFiles"]>().mockResolvedValue(config.files),
    getPullRequestComments: jest.fn<IGitHubClient["getPullRequestComments"]>().mockResolvedValue(
      config.existingBody === undefined ? [] : [{ id: 17, body: config.existingBody, isFromBot: true, gitHubApp: { id: "appid1234" } }]
    ),
    addCommentToPullRequest: jest.fn<IGitHubClient["addCommentToPullRequest"]>(),
    updatePullRequestComment: jest.fn<IGitHubClient["updatePullRequestComment"]>(),
    getRepositoryContent: jest.fn<IGitHubClient["getRepositoryContent"]>(),
    compareCommitsWithBasehead: jest.fn<IGitHubClient["compareCommitsWithBasehead"]>(),
    searchCode: jest.fn<IGitHubClient["searchCode"]>()
  }
  const sut = new PullRequestCommenter({
    domain: "https://example.com", siteName: "Demo Docs", repositoryNameSuffix: "-openapi",
    projectConfigurationFilename: ".demo-docs.yml", gitHubAppId: "appid1234", gitHubClient: client
  })
  const request = { appInstallationId: 1234, pullRequestNumber: 42, repositoryOwner: "acme", repositoryName: "aurora", ref: "feature/api" }
  return { sut, client, request }
}

test.each(["configYml", "configYaml"] as const)("It comments on configured nested specs in a bare repository using %s", async variant => {
  const { sut, client, request } = configuredCommenter({
    variant,
    text: "specifications:\n  - path: services/user/openapi.yaml\n  - path: services/orders/api.json",
    files: [
      { filename: "services/user/openapi.yaml", status: "modified" },
      { filename: "services/orders/api.json", status: "added" },
      { filename: "services/other/openapi.yaml", status: "modified" },
      { filename: ".github/workflows/build.yml", status: "modified" },
      { filename: "unrelated.yml", status: "modified" }
    ]
  })
  await sut.commentPullRequest(request)
  expect(client.graphql).toHaveBeenCalledWith(expect.objectContaining({ appInstallationId: 1234 }))
  const body = client.addCommentToPullRequest.mock.calls[0][0].body
  expect(body).toContain("https://example.com/acme/aurora/feature/api/services%2Fuser%2Fopenapi.yaml")
  expect(body).toContain("services%2Forders%2Fapi.json")
  expect(body).not.toContain("services/other")
  expect(body).not.toContain("build.yml")
  expect(body).not.toContain("unrelated.yml")
})

test("It skips bare repositories without configuration", async () => {
  const { sut, client, request } = configuredCommenter({ files: [{ filename: "api.yml", status: "modified" }] })
  await sut.commentPullRequest(request)
  expect(client.getPullRequestFiles).not.toHaveBeenCalled()
  expect(client.addCommentToPullRequest).not.toHaveBeenCalled()
})

test("It skips comments for unrelated files when specs are configured", async () => {
  const { sut, client, request } = configuredCommenter({
    text: "specifications:\n  - path: services/user/openapi.yaml",
    files: [{ filename: "other.yml", status: "modified" }]
  })
  await sut.commentPullRequest(request)
  expect(client.addCommentToPullRequest).not.toHaveBeenCalled()
})

test("It updates existing comments and shows removed configured specs without a preview link", async () => {
  const { sut, client, request } = configuredCommenter({
    text: "specifications:\n  - path: services/user/openapi.yaml",
    files: [{ filename: "services/user/openapi.yaml", status: "removed" }],
    existingBody: "old comment"
  })
  await sut.commentPullRequest(request)
  const update = client.updatePullRequestComment.mock.calls[0][0]
  expect(update.commentId).toBe(17)
  expect(update.body).toContain("services/user/openapi.yaml")
  expect(update.body).toContain("Removed")
  expect(update.body).not.toContain(">Preview</a>")
  expect(client.addCommentToPullRequest).not.toHaveBeenCalled()
})

test("It adds comment when none exist", async () => {
  let didAddComment = false
  const sut = new PullRequestCommenter({
    domain: "https://example.com",
    siteName: "Demo Docs",
    repositoryNameSuffix: "-openapi",
    projectConfigurationFilename: ".demo-docs.yml",
    gitHubAppId: "appid1234",
    gitHubClient: {
      async graphql() {
        return {}
      },
      async getRepositoryContent() {
        return { downloadURL: "https://example.com" }
      },
      async getPullRequestFiles() {
        return [{
          filename: "openapi.yml",
          status: "changed"
        }]
      },
      async getPullRequestComments() {
        return []
      },
      async addCommentToPullRequest() {
        didAddComment = true
      },
      async updatePullRequestComment() {}
    }
  })
  await sut.commentPullRequest({
    appInstallationId: 1234,
    pullRequestNumber: 42,
    repositoryOwner: "acme",
    repositoryName: "demo-openapi",
    ref: "main"
  })
  expect(didAddComment).toBeTruthy()
})

test("It adds comment containing list of changed files", async () => {
  let didAddComment = false
  let commentBody: string | undefined
  const sut = new PullRequestCommenter({
    domain: "https://example.com",
    siteName: "Demo Docs",
    repositoryNameSuffix: "-openapi",
    projectConfigurationFilename: ".demo-docs.yml",
    gitHubAppId: "appid1234",
    gitHubClient: {
      async graphql() {
        return {}
      },
      async getRepositoryContent() {
        return { downloadURL: "https://example.com" }
      },
      async getPullRequestFiles() {
        return [{
          filename: "foo.yml",
          status: "changed"
        }, {
          filename: "bar.yml",
          status: "changed"
        }]
      },
      async getPullRequestComments() {
        return []
      },
      async addCommentToPullRequest(request) {
        didAddComment = true
        commentBody = request.body
      },
      async updatePullRequestComment() {}
    }
  })
  await sut.commentPullRequest({
    appInstallationId: 1234,
    pullRequestNumber: 42,
    repositoryOwner: "acme",
    repositoryName: "demo-openapi",
    ref: "main"
  })
  expect(didAddComment).toBeTruthy()
  expect(commentBody).toContain("<table>")
  expect(commentBody).toContain("foo.yml")
  expect(commentBody).toContain("bar.yml")
})

test("It skips adding comment when no YAML files were found in the PR", async () => {
  let didAddComment = false
  const sut = new PullRequestCommenter({
    domain: "https://example.com",
    siteName: "Demo Docs",
    repositoryNameSuffix: "-openapi",
    projectConfigurationFilename: ".demo-docs.yml",
    gitHubAppId: "appid1234",
    gitHubClient: {
      async graphql() {
        return {}
      },
      async getRepositoryContent() {
        return { downloadURL: "https://example.com" }
      },
      async getPullRequestFiles() {
        return [{
          filename: "dummy.swift",
          status: "changed"
        }]
      },
      async getPullRequestComments() {
        return []
      },
      async addCommentToPullRequest() {
        didAddComment = true
      },
      async updatePullRequestComment() {}
    }
  })
  await sut.commentPullRequest({
    appInstallationId: 1234,
    pullRequestNumber: 42,
    repositoryOwner: "acme",
    repositoryName: "demo-openapi",
    ref: "main"
  })
  expect(didAddComment).toBeFalsy()
})

test("It updates comment when one already exists", async () => {
  let didUpdateComment = false
  const sut = new PullRequestCommenter({
    domain: "https://example.com",
    siteName: "Demo Docs",
    repositoryNameSuffix: "-openapi",
    projectConfigurationFilename: ".demo-docs.yml",
    gitHubAppId: "appid1234",
    gitHubClient: {
      async graphql() {
        return {}
      },
      async getRepositoryContent() {
        return { downloadURL: "https://example.com" }
      },
      async getPullRequestFiles() {
        return [{
          filename: "openapi.yml",
          status: "changed"
        }]
      },
      async getPullRequestComments() {
        return [{
          id: 1,
          body: "Hello world!",
          isFromBot: true,
          gitHubApp: {
            id: "appid1234"
          }
        }]
      },
      async addCommentToPullRequest() {},
      async updatePullRequestComment() {
        didUpdateComment = true
      }
    }
  })
  await sut.commentPullRequest({
    appInstallationId: 1234,
    pullRequestNumber: 42,
    repositoryOwner: "acme",
    repositoryName: "demo-openapi",
    ref: "main"
  })
  expect(didUpdateComment).toBeTruthy()
})

test("It skips updating comment when the body has not changed", async () => {
  let addedCommentBody: string | undefined
  let didUpdateComment = false
  const sut = new PullRequestCommenter({
    domain: "https://example.com",
    siteName: "Demo Docs",
    repositoryNameSuffix: "-openapi",
    projectConfigurationFilename: ".demo-docs.yml",
    gitHubAppId: "appid1234",
    gitHubClient: {
      async graphql() {
        return {}
      },
      async getRepositoryContent() {
        return { downloadURL: "https://example.com" }
      },
      async getPullRequestFiles() {
        return [{
          filename: "openapi.yml",
          status: "changed"
        }]
      },
      async getPullRequestComments() {
        if (!addedCommentBody) {
          return []
        }
        return [{
          id: 1,
          body: addedCommentBody,
          isFromBot: true,
          gitHubApp: {
            id: "appid1234"
          }
        }]
      },
      async addCommentToPullRequest(request) {
        addedCommentBody = request.body
      },
      async updatePullRequestComment() {
        didUpdateComment = true
      }
    }
  })
  // Add a comment.
  await sut.commentPullRequest({
    appInstallationId: 1234,
    pullRequestNumber: 42,
    repositoryOwner: "acme",
    repositoryName: "demo-openapi",
    ref: "main"
  })
  // Attempt to update a comment. This is skipped because the body has not changed.
  await sut.commentPullRequest({
    appInstallationId: 1234,
    pullRequestNumber: 42,
    repositoryOwner: "acme",
    repositoryName: "demo-openapi",
    ref: "main"
  })
  expect(addedCommentBody).not.toBeUndefined()
  expect(didUpdateComment).toBeFalsy()
})

test("It updates comment to remove file list when all relevant file changes were removed from the PR", async () => {
  let didAddComment = false
  let didUpdateComment = false
  let addedCommentBody: string | undefined
  let updatedCommentBody: string | undefined
  const sut = new PullRequestCommenter({
    domain: "https://example.com",
    siteName: "Demo Docs",
    repositoryNameSuffix: "-openapi",
    projectConfigurationFilename: ".demo-docs.yml",
    gitHubAppId: "appid1234",
    gitHubClient: {
      async graphql() {
        return {}
      },
      async getRepositoryContent() {
        return { downloadURL: "https://example.com" }
      },
      async getPullRequestFiles() {
        if (didAddComment) {
          // Simulate relevant files removed.
          return []
        } else {
          return [{
            filename: "openapi.yml",
            status: "changed"
          }]
        }
      },
      async getPullRequestComments() {
        if (!didAddComment) {
          return []
        }
        return [{
          id: 1,
          body: "Hello world",
          isFromBot: true,
          gitHubApp: {
            id: "appid1234"
          }
        }]
      },
      async addCommentToPullRequest(request) {
        didAddComment = true
        addedCommentBody = request.body
      },
      async updatePullRequestComment(request) {
        didUpdateComment = true
        updatedCommentBody = request.body
      }
    }
  })
  // Add a comment.
  await sut.commentPullRequest({
    appInstallationId: 1234,
    pullRequestNumber: 42,
    repositoryOwner: "acme",
    repositoryName: "demo-openapi",
    ref: "main"
  })
  // Attempt to update a comment. This is skipped because the body has not changed.
  await sut.commentPullRequest({
    appInstallationId: 1234,
    pullRequestNumber: 42,
    repositoryOwner: "acme",
    repositoryName: "demo-openapi",
    ref: "main"
  })
  expect(didAddComment).toBeTruthy()
  expect(didUpdateComment).toBeTruthy()
  expect(addedCommentBody).toContain("<table>")
  expect(addedCommentBody).toContain("openapi.yml")
  expect(updatedCommentBody).not.toContain("<table>")
  expect(updatedCommentBody).not.toContain("openapi.yml")
})

test("It adds comment if only project configuration was edited", async () => {
  let didAddComment = false
  let commentBody: string | undefined
  const sut = new PullRequestCommenter({
    domain: "https://example.com",
    siteName: "Demo Docs",
    repositoryNameSuffix: "-openapi",
    projectConfigurationFilename: ".demo-docs.yml",
    gitHubAppId: "appid1234",
    gitHubClient: {
      async graphql() {
        return {}
      },
      async getRepositoryContent() {
        return { downloadURL: "https://example.com" }
      },
      async getPullRequestFiles() {
        return [{
          filename: ".demo-docs.yml",
          status: "changed"
        }]
      },
      async getPullRequestComments() {
        if (!didAddComment) {
          return []
        }
        return [{
          id: 1,
          body: "Hello world",
          isFromBot: true,
          gitHubApp: {
            id: "appid1234"
          }
        }]
      },
      async addCommentToPullRequest(request) {
        didAddComment = true
        commentBody = request.body
      },
      async updatePullRequestComment() {}
    }
  })
  await sut.commentPullRequest({
    appInstallationId: 1234,
    pullRequestNumber: 42,
    repositoryOwner: "acme",
    repositoryName: "demo-openapi",
    ref: "main"
  })
  expect(didAddComment).toBeTruthy()
  expect(commentBody).toContain("<table>")
  expect(commentBody).toContain(".demo-docs.yml")
})

test("It ignores files starting with a dot", async () => {
  let didAddComment = false
  let commentBody: string | undefined
  const sut = new PullRequestCommenter({
    domain: "https://example.com",
    siteName: "Demo Docs",
    repositoryNameSuffix: "-openapi",
    projectConfigurationFilename: ".demo-docs.yml",
    gitHubAppId: "appid1234",
    gitHubClient: {
      async graphql() {
        return {}
      },
      async getRepositoryContent() {
        return { downloadURL: "https://example.com" }
      },
      async getPullRequestFiles() {
        return [{
          filename: "openapi.yml",
          status: "changed"
        }, {
          filename: ".foo,yml",
          status: "changed"
        }]
      },
      async getPullRequestComments() {
        return []
      },
      async addCommentToPullRequest(request) {
        didAddComment = true
        commentBody = request.body
      },
      async updatePullRequestComment() {}
    }
  })
  await sut.commentPullRequest({
    appInstallationId: 1234,
    pullRequestNumber: 42,
    repositoryOwner: "acme",
    repositoryName: "demo-openapi",
    ref: "main"
  })
  expect(didAddComment).toBeTruthy()
  expect(commentBody).toContain("<table>")
  expect(commentBody).toContain("openapi.yml")
  expect(commentBody).not.toContain(".foo.yml")
})

test("It ignores files in directories", async () => {
  let didAddComment = false
  let commentBody: string | undefined
  const sut = new PullRequestCommenter({
    domain: "https://example.com",
    siteName: "Demo Docs",
    repositoryNameSuffix: "-openapi",
    projectConfigurationFilename: ".demo-docs.yml",
    gitHubAppId: "appid1234",
    gitHubClient: {
      async graphql() {
        return {}
      },
      async getRepositoryContent() {
        return { downloadURL: "https://example.com" }
      },
      async getPullRequestFiles() {
        return [{
          filename: "openapi.yml",
          status: "changed"
        }, {
          filename: "foo/bar,yml",
          status: "changed"
        }]
      },
      async getPullRequestComments() {
        return []
      },
      async addCommentToPullRequest(request) {
        didAddComment = true
        commentBody = request.body
      },
      async updatePullRequestComment() {}
    }
  })
  await sut.commentPullRequest({
    appInstallationId: 1234,
    pullRequestNumber: 42,
    repositoryOwner: "acme",
    repositoryName: "demo-openapi",
    ref: "main"
  })
  expect(didAddComment).toBeTruthy()
  expect(commentBody).toContain("<table>")
  expect(commentBody).toContain("openapi.yml")
  expect(commentBody).not.toContain("foo/bar.yml")
})

test("It does not post comment if changes only include ignored filenames", async () => {
  let didAddComment = false
  const sut = new PullRequestCommenter({
    domain: "https://example.com",
    siteName: "Demo Docs",
    repositoryNameSuffix: "-openapi",
    projectConfigurationFilename: ".demo-docs.yml",
    gitHubAppId: "appid1234",
    gitHubClient: {
      async graphql() {
        return {}
      },
      async getRepositoryContent() {
        return { downloadURL: "https://example.com" }
      },
      async getPullRequestFiles() {
        return [{
          filename: ".foo.yml",
          status: "changed"
        }, {
          filename: ".github/workflows/bar.yml",
          status: "changed"
        }]
      },
      async getPullRequestComments() {
        return []
      },
      async addCommentToPullRequest(_request) {
        didAddComment = true
      },
      async updatePullRequestComment() {}
    }
  })
  await sut.commentPullRequest({
    appInstallationId: 1234,
    pullRequestNumber: 42,
    repositoryOwner: "acme",
    repositoryName: "demo-openapi",
    ref: "main"
  })
  expect(didAddComment).toBeFalsy()
})
