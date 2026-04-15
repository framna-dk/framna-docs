import ProjectSummary from "./ProjectSummary"
import IProjectListDataSource from "./IProjectListDataSource"
import IProjectListRepository from "./IProjectListRepository"

export default class CachingProjectListDataSource implements IProjectListDataSource {
  private dataSource: IProjectListDataSource
  private repository: IProjectListRepository

  constructor(config: {
    dataSource: IProjectListDataSource
    repository: IProjectListRepository
  }) {
    this.dataSource = config.dataSource
    this.repository = config.repository
  }

  async getProjectList(options?: { refresh?: boolean }): Promise<ProjectSummary[]> {
    if (!options?.refresh) {
      const cache = await this.repository.get()
      if (cache !== undefined) {
        return cache
      }
    }
    const projects = await this.dataSource.getProjectList()
    await this.repository.set(projects)
    return projects
  }
}
