import Project from "./Project"

export default interface IProjectDetailsDataSource {
  getProjectDetails(owner: string, repo: string, options?: { exactRepository?: boolean }): Promise<Project | null>
}
