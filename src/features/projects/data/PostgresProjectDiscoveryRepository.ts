import type { IDB } from "@/common"
import type IProjectDiscoveryRepository from "../domain/IProjectDiscoveryRepository"
import type { ProjectDiscoveryRepository } from "../domain/IProjectDiscoveryRepository"

export default class PostgresProjectDiscoveryRepository implements IProjectDiscoveryRepository {
  constructor(private readonly db: IDB) {}

  async getRepositories(): Promise<ProjectDiscoveryRepository[]> {
    const result = await this.db.query<{ owner: string; name: string }>(
      "SELECT owner, name FROM project_discovery_repositories ORDER BY owner, name"
    )
    return result.rows
  }

  async add(repository: ProjectDiscoveryRepository): Promise<void> {
    await this.db.query(
      "INSERT INTO project_discovery_repositories (owner, name) VALUES ($1, $2) ON CONFLICT (owner, name) DO NOTHING",
      [repository.owner.toLowerCase(), repository.name.toLowerCase()]
    )
  }
}
