import { jest } from "@jest/globals"
import type GitHubClientType from "@/common/github/GitHubClient"

const graphql = jest.fn<() => Promise<unknown>>().mockResolvedValue({ repository: {} })
const installationAuth = jest.fn<() => Promise<{ token: string }>>()
  .mockResolvedValue({ token: "installation-token" })
const octokit = jest.fn().mockImplementation(() => ({ graphql }))

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
