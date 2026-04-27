import ProjectSummary from "./ProjectSummary"

export default interface IProjectListDataSource {
  getProjectList(options?: { refresh?: boolean }): Promise<ProjectSummary[]>
}
