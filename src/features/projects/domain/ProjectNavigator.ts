import Project from "./Project"
import { getDefaultSpecification } from "./Version"
import { getProjectPath } from "./projectRoutes"

interface IPathnameReader {
  readonly pathname: string
}

export interface IRouter {
  push(path: string): void
  replace(path: string): void
}

export default class ProjectNavigator {
  private readonly pathnameReader: IPathnameReader
  private readonly router: IRouter
  
  constructor(config: { pathnameReader: IPathnameReader, router: IRouter }) {
    this.pathnameReader = config.pathnameReader
    this.router = config.router
  }
  
  navigateToVersion(
    project: Project,
    versionId: string,
    preferredSpecificationName: string
  ) {
    // Let's see if we can find a specification with the same name.
    const newVersion = project.versions.find(e => {
      return e.id == versionId
    })
    if (!newVersion) {
      return
    }
    const candidateSpecification = newVersion.specifications.find(e => {
      return e.name == preferredSpecificationName
    })
    if (candidateSpecification) {
      const encodedPath = this.encodePath(project.owner, project.name, newVersion.id, candidateSpecification.id, getProjectPath(project))
      this.router.push(encodedPath)
    } else {
      const defaultOrFirstSpecification = getDefaultSpecification(newVersion)
      const encodedPath = this.encodePath(project.owner, project.name, newVersion.id, defaultOrFirstSpecification.id, getProjectPath(project))
      this.router.push(encodedPath)
    }
  }
  
  navigate(
    projectOwner: string,
    projectName: string,
    versionId: string,
    specificationId: string,
    projectPath?: string
  ) {
    const encodedPath = this.encodePath(projectOwner, projectName, versionId, specificationId, projectPath)
    this.router.push(encodedPath)
  }

  navigateIfNeeded(selection: {
    projectOwner?: string
    projectName?: string
    versionId?: string
    specificationId?: string
    projectPath?: string
  }) {
    if (!selection.projectOwner || !selection.projectName || !selection.versionId || !selection.specificationId) {
      return
    }
    const path = this.encodePath(selection.projectOwner, selection.projectName, selection.versionId, selection.specificationId, selection.projectPath)
    if (path !== this.pathnameReader.pathname) {
      this.router.replace(path)
    }
  }

  private encodePath(owner: string, projectName: string, versionId: string, specificationId: string, projectPath?: string): string {
    const encodedVersionId = versionId.split('/').map(segment => encodeURIComponent(segment)).join('/')
    const encodedSpecificationId = encodeURIComponent(specificationId)
    return `${projectPath ?? getProjectPath({ owner, name: projectName })}/${encodedVersionId}/${encodedSpecificationId}`
  }
}
