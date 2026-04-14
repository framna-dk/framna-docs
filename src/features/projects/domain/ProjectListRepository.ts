import { IUserDataRepository, ZodJSONCoder } from "@/common"
import IProjectListRepository from "./IProjectListRepository"
import ProjectSummary, { ProjectSummarySchema } from "./ProjectSummary"

interface IUserIDReader {
  getUserId(): Promise<string>
}

export default class ProjectListRepository implements IProjectListRepository {
  private readonly userIDReader: IUserIDReader
  private readonly repository: IUserDataRepository<string>

  constructor(config: { userIDReader: IUserIDReader, repository: IUserDataRepository<string> }) {
    this.userIDReader = config.userIDReader
    this.repository = config.repository
  }

  async get(): Promise<ProjectSummary[] | undefined> {
    const userId = await this.userIDReader.getUserId()
    const string = await this.repository.get(userId)

    if (!string) {
      return undefined
    }
    try {
      return ZodJSONCoder.decode(ProjectSummarySchema.array(), string)
    } catch {
      console.warn("[ProjectListRepository] Failed to decode cached project list – treating as cache miss")
      return undefined
    }
  }

  async set(projects: ProjectSummary[]): Promise<void> {
    const userId = await this.userIDReader.getUserId()
    const string = ZodJSONCoder.encode(ProjectSummarySchema.array(), projects)
    await this.repository.setExpiring(userId, string, 30 * 24 * 3600) // 30 days TTL
  }

  async delete(): Promise<void> {
    const userId = await this.userIDReader.getUserId()
    await this.repository.delete(userId)
  }
}
