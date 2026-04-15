import Project from "./Project"

export default interface IProjectDetailsDataSource {
  getProjectDetails(owner: string, repo: string): Promise<Project | null>
}
