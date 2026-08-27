import { IUserDataRepository, ZodJSONCoder } from "@/common"
import IConfigFileScanRepository, { ConfigFileScan, ConfigFileScanSchema } from "./IConfigFileScanRepository"

interface IUserIDReader {
  getUserId(): Promise<string>
}

export default class ConfigFileScanRepository implements IConfigFileScanRepository {
  private readonly userIDReader: IUserIDReader
  private readonly repository: IUserDataRepository<string>

  constructor(config: { userIDReader: IUserIDReader, repository: IUserDataRepository<string> }) {
    this.userIDReader = config.userIDReader
    this.repository = config.repository
  }

  async get(): Promise<ConfigFileScan | undefined> {
    const userId = await this.userIDReader.getUserId()
    const string = await this.repository.get(userId)
    if (!string) {
      return undefined
    }
    try {
      return ZodJSONCoder.decode(ConfigFileScanSchema, string)
    } catch {
      console.warn("[ConfigFileScanRepository] Failed to decode cached scan – treating as cache miss")
      return undefined
    }
  }

  async set(scan: ConfigFileScan): Promise<void> {
    const userId = await this.userIDReader.getUserId()
    const string = ZodJSONCoder.encode(ConfigFileScanSchema, scan)
    await this.repository.setExpiring(userId, string, 24 * 3600) // 24 hours TTL
  }

  async delete(): Promise<void> {
    const userId = await this.userIDReader.getUserId()
    await this.repository.delete(userId)
  }
}
