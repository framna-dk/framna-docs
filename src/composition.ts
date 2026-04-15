import { Pool } from "pg"
import NextAuth from "next-auth"
import GithubProvider from "next-auth/providers/github"
import PostgresAdapter from "@auth/pg-adapter"
import RedisKeyedMutexFactory from "@/common/mutex/RedisKeyedMutexFactory"
import RedisKeyValueStore from "@/common/key-value-store/RedisKeyValueStore"
import {
  AuthjsSession,
  env,
  GitHubClient,
  ISession,
  KeyValueUserDataRepository,
  OAuthTokenRefreshingGitHubClient,
  PostgreSQLDB,
  SessionMutexFactory,
  listFromCommaSeparatedString
} from "@/common"
import {
  GitHubLoginDataSource,
  GitHubProjectListDataSource,
  GitHubProjectDetailsDataSource
} from "@/features/projects/data"
import {
  CachingProjectListDataSource,
  ProjectListRepository
} from "@/features/projects/domain"
import {
  GitHubOAuthTokenRefresher
} from "@/features/auth/data"
import {
  AuthjsAccountsOAuthTokenRepository,
  CompositeLogOutHandler,
  ErrorIgnoringLogOutHandler,
  FallbackOAuthTokenRepository,
  LockingOAuthTokenRefresher,
  LogInHandler,
  OAuthTokenDataSource,
  OAuthTokenRepository,
  OAuthTokenSessionValidator,
  PersistingOAuthTokenRefresher,
  UserDataCleanUpLogOutHandler
} from "@/features/auth/domain"
import {
  GitHubHookHandler
} from "@/features/hooks/data"
import {
  PostCommentPullRequestEventHandler,
  FilteringPullRequestEventHandler,
  RepositoryNameEventFilter,
  PullRequestCommenter
} from "@/features/hooks/domain"
import { RepoRestrictedGitHubClient } from "./common/github/RepoRestrictedGitHubClient"
import RsaEncryptionService from "./features/encrypt/EncryptionService"
import RemoteConfigEncoder from "./features/projects/domain/RemoteConfigEncoder"
import { OasDiffCalculator } from "./features/diff/data/OasDiffCalculator"
import { IOasDiffCalculator } from "./features/diff/data/IOasDiffCalculator"

const gitHubAppCredentials = {
  appId: env.getOrThrow("GITHUB_APP_ID"),
  clientId: env.getOrThrow("GITHUB_CLIENT_ID"),
  clientSecret: env.getOrThrow("GITHUB_CLIENT_SECRET"),
  privateKey: Buffer
    .from(env.getOrThrow("GITHUB_PRIVATE_KEY_BASE_64"), "base64")
    .toString("utf-8")
}

const pool = new Pool({
  host: env.getOrThrow("POSTGRESQL_HOST"),
  user: env.getOrThrow("POSTGRESQL_USER"),
  password: env.get("POSTGRESQL_PASSWORD"),
  database: env.getOrThrow("POSTGRESQL_DB"),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
})

const db = new PostgreSQLDB({ pool })

const oauthTokenRepository = new FallbackOAuthTokenRepository({
  primaryRepository: new OAuthTokenRepository({ db, provider: "github" }),
  secondaryRepository: new AuthjsAccountsOAuthTokenRepository({ db, provider: "github" })
})

const logInHandler = new LogInHandler({ oauthTokenRepository })

export const { signIn, auth, handlers: authHandlers } = NextAuth({
  adapter: PostgresAdapter(pool),
  secret: env.getOrThrow("NEXTAUTH_SECRET"),
  theme: {
    logo: "/images/logo.png",
    colorScheme: "light",
    brandColor: "black"
  },
  pages: {
    signIn: "/auth/signin"
  },
  providers: [
    GithubProvider({
      clientId: env.getOrThrow("GITHUB_CLIENT_ID"),
      clientSecret: env.getOrThrow("GITHUB_CLIENT_SECRET"),
      authorization: {
        params: {
          scope: "repo"
        }
      }
    })
  ],
  session: {
    strategy: "database"
  },
  callbacks: {
    async signIn({ user, account }) {
      return await logInHandler.handleLogIn({ user, account })
    },
    async session({ session, user }) {
      // Construct a new session object conforming to DefaultSession
      // If "session" is returned it will include everything from AdapterSession,
      // which is critical as this contains the sessionToken
      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image
        },
        expires: session.expires,
      }
    }
  }
})

export const session: ISession = new AuthjsSession({ auth })

const oauthTokenDataSource = new OAuthTokenDataSource({
  session,
  repository: oauthTokenRepository
})

const oauthTokenRefresher = new LockingOAuthTokenRefresher({
  mutexFactory: new SessionMutexFactory({
    baseKey: "mutexLockingOAuthTokenRefresher",
    mutexFactory: new RedisKeyedMutexFactory(env.getOrThrow("REDIS_URL")),
    userIdReader: session
  }),
  oauthTokenRefresher: new PersistingOAuthTokenRefresher({
    userIdReader: session,
    oauthTokenRepository,
    oauthTokenRefresher: new GitHubOAuthTokenRefresher(gitHubAppCredentials)
  })
})

const gitHubClient = new GitHubClient({
  ...gitHubAppCredentials,
  oauthTokenDataSource
})

const repoRestrictedGitHubClient = new RepoRestrictedGitHubClient({
  repositoryNameSuffix: env.getOrThrow("REPOSITORY_NAME_SUFFIX"),
  gitHubClient
})

export const userGitHubClient = new OAuthTokenRefreshingGitHubClient({
  gitHubClient: repoRestrictedGitHubClient,
  oauthTokenDataSource,
  oauthTokenRefresher
})

export const blockingSessionValidator = new OAuthTokenSessionValidator({
  oauthTokenDataSource
})

const projectUserDataRepository = new KeyValueUserDataRepository({
  store: new RedisKeyValueStore(env.getOrThrow("REDIS_URL")),
  baseKey: "projects"
})

export const encryptionService = new RsaEncryptionService({
  publicKey: Buffer.from(env.getOrThrow("ENCRYPTION_PUBLIC_KEY_BASE_64"), "base64").toString("utf-8"),
  privateKey: Buffer.from(env.getOrThrow("ENCRYPTION_PRIVATE_KEY_BASE_64"), "base64").toString("utf-8")
})

export const remoteConfigEncoder = new RemoteConfigEncoder(encryptionService)

const gitHubProjectListDataSource = new GitHubProjectListDataSource({
  loginsDataSource: new GitHubLoginDataSource({
    graphQlClient: userGitHubClient
  }),
  graphQlClient: userGitHubClient,
  repositoryNameSuffix: env.getOrThrow("REPOSITORY_NAME_SUFFIX"),
  projectConfigurationFilename: env.getOrThrow("FRAMNA_DOCS_PROJECT_CONFIGURATION_FILENAME"),
  hiddenRepositories: listFromCommaSeparatedString(env.get("HIDDEN_REPOSITORIES"))
})

const projectListUserDataRepository = new KeyValueUserDataRepository({
  store: new RedisKeyValueStore(env.getOrThrow("REDIS_URL")),
  baseKey: "projectList"
})

const projectListRepository = new ProjectListRepository({
  userIDReader: session,
  repository: projectListUserDataRepository
})

export const projectListDataSource = new CachingProjectListDataSource({
  dataSource: gitHubProjectListDataSource,
  repository: projectListRepository
})

export const projectDetailsDataSource = new GitHubProjectDetailsDataSource({
  graphQlClient: userGitHubClient,
  repositoryNameSuffix: env.getOrThrow("REPOSITORY_NAME_SUFFIX"),
  projectConfigurationFilename: env.getOrThrow("FRAMNA_DOCS_PROJECT_CONFIGURATION_FILENAME"),
  encryptionService: encryptionService,
  remoteConfigEncoder: remoteConfigEncoder
})

export const logOutHandler = new ErrorIgnoringLogOutHandler(
  new CompositeLogOutHandler([
    new UserDataCleanUpLogOutHandler(session, projectUserDataRepository),
    new UserDataCleanUpLogOutHandler(session, projectListUserDataRepository)
  ])
)

export const gitHubHookHandler = new GitHubHookHandler({
  secret: env.getOrThrow("GITHUB_WEBHOOK_SECRET"),
  pullRequestEventHandler: new FilteringPullRequestEventHandler({
    filter: new RepositoryNameEventFilter({
      repositoryNameSuffix: env.getOrThrow("REPOSITORY_NAME_SUFFIX"),
      allowlist: listFromCommaSeparatedString(env.get("GITHUB_WEBHOK_REPOSITORY_ALLOWLIST")),
      disallowlist: listFromCommaSeparatedString(env.get("GITHUB_WEBHOK_REPOSITORY_DISALLOWLIST"))
    }),
    eventHandler: new PostCommentPullRequestEventHandler({
      pullRequestCommenter: new PullRequestCommenter({
        siteName: env.getOrThrow("FRAMNA_DOCS_TITLE"),
        domain: env.getOrThrow("FRAMNA_DOCS_BASE_URL"),
        repositoryNameSuffix: env.getOrThrow("REPOSITORY_NAME_SUFFIX"),
        projectConfigurationFilename: env.getOrThrow("FRAMNA_DOCS_PROJECT_CONFIGURATION_FILENAME"),
        gitHubAppId: env.getOrThrow("GITHUB_APP_ID"),
        gitHubClient: gitHubClient
      })
    })
  })
})

export const diffCalculator: IOasDiffCalculator = new OasDiffCalculator(gitHubClient)
