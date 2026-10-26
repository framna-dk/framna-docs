import type ProjectSummary from "./ProjectSummary"
import { getProjectPath } from "./projectRoutes"

type ListRequest = { id: number; additionVersion: number }
const keyFor = (project: ProjectSummary) => getProjectPath(project).toLowerCase()
const sorted = (projects: Iterable<ProjectSummary>) => Array.from(projects).sort((a, b) => a.displayName.localeCompare(b.displayName))

/** Coordinates list responses and successful registrations independently of React renders. */
export default class ProjectListState {
  private projects: ProjectSummary[] = []
  private requestId = 0
  private additionVersion = 0
  private additions = new Map<string, { project: ProjectSummary; version: number }>()

  beginRequest(): ListRequest {
    return { id: ++this.requestId, additionVersion: this.additionVersion }
  }

  isCurrent(request: ListRequest): boolean {
    return request.id === this.requestId
  }

  addProject(project: ProjectSummary): ProjectSummary[] {
    const key = keyFor(project)
    this.additions.set(key, { project, version: ++this.additionVersion })
    this.projects = sorted([...this.projects.filter(item => keyFor(item) !== key), project])
    return this.projects
  }

  applyResponse(request: ListRequest, projects: ProjectSummary[]): ProjectSummary[] | undefined {
    // Ignore superseded responses before touching pending registrations or the list.
    if (!this.isCurrent(request)) return undefined
    const merged = new Map(projects.map(project => [keyFor(project), project]))
    this.additions.forEach(({ project, version }, key) => {
      if (merged.has(key) || version <= request.additionVersion) this.additions.delete(key)
      else merged.set(key, project)
    })
    this.projects = sorted(merged.values())
    return this.projects
  }
}
