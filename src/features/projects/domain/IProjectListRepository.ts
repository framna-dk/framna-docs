import ProjectSummary from "./ProjectSummary"

export default interface IProjectListRepository {
  get(): Promise<ProjectSummary[] | undefined>
  set(projects: ProjectSummary[]): Promise<void>
  delete(): Promise<void>
}
