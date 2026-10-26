import { jest } from "@jest/globals"
import type GitHubClientType from "@/common/github/GitHubClient"

const graphql = jest.fn<() => Promise<unknown>>().mockResolvedValue({ repository: {} })
const installationAuth = jest.fn<() => Promise<{ token: string }>>()
  .mockResolvedValue({ token: "installation-token" })
const listFiles = jest.fn()
const paginate = jest.fn<() => Promise<unknown[]>>()
const octokit = jest.fn().mockImplementation(() => ({ graphql, paginate, rest: { pulls: { listFiles } } }))

jest.unstable_mockModule("octokit", () => ({ Octokit: octokit }))
jest.unstable_mockModule("@octokit/auth-app", () => ({ createAppAuth: () => installationAuth }))

let GitHubClient: typeof GitHubClientType
beforeAll(async () => {
  GitHubClient = (await import("@/common/github/GitHubClient")).default
})

function createClient() {
  const getOAuthToken = jest.fn<() => Promise<{ accessToken: string }>>()
    .mockResolvedValue({ accessToken: "user-token" })
  const client = new GitHubClient({
    appId: "123", clientId: "client", clientSecret: "secret", privateKey: "key",
    oauthTokenDataSource: { getOAuthToken }
  })
  return { client, getOAuthToken }
}

test("It uses installation authentication for webhook GraphQL without reading the user session", async () => {
  const { client, getOAuthToken } = createClient()
  const variables = { owner: "acme", name: "aurora" }
  await client.graphql({ query: "query PreviewConfiguration", variables, appInstallationId: 42 })
  expect(installationAuth).toHaveBeenCalledWith({ type: "installation", installationId: 42 })
  expect(octokit).toHaveBeenCalledWith({ auth: "installation-token" })
  expect(graphql).toHaveBeenCalledWith("query PreviewConfiguration", variables)
  expect(getOAuthToken).not.toHaveBeenCalled()
})

test("It continues to use the user's token for ordinary GraphQL requests", async () => {
  const { client, getOAuthToken } = createClient()
  await client.graphql({ query: "query ProjectDetails" })
  expect(getOAuthToken).toHaveBeenCalledTimes(1)
  expect(octokit).toHaveBeenCalledWith({ auth: "user-token" })
  expect(installationAuth).not.toHaveBeenCalled()
})

test("It preserves the original path of renamed pull request files", async () => {
  paginate.mockResolvedValueOnce([
    { filename: "archive/openapi.yaml", previous_filename: "services/user/openapi.yaml", status: "renamed" },
    { filename: "services/orders/openapi.yaml", status: "modified" }
  ])
  const { client, getOAuthToken } = createClient()
  const files = await client.getPullRequestFiles({
    appInstallationId: 42, repositoryOwner: "acme", repositoryName: "aurora", pullRequestNumber: 7
  })
  expect(files).toEqual([
    { filename: "archive/openapi.yaml", previousFilename: "services/user/openapi.yaml", status: "renamed" },
    { filename: "services/orders/openapi.yaml", previousFilename: undefined, status: "modified" }
  ])
  expect(getOAuthToken).not.toHaveBeenCalled()
})
