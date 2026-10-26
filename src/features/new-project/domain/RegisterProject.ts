import type IProjectDiscoveryRepository from "@/features/projects/domain/IProjectDiscoveryRepository"
import type { ProjectDiscoveryRepository } from "@/features/projects/domain/IProjectDiscoveryRepository"
import type { ProjectSummary } from "@/features/projects/domain"
import parseGitHubRepository from "./parseGitHubRepository"

interface IProjectCandidateDataSource {
  getProjectCandidate(repository: ProjectDiscoveryRepository): Promise<{
    repository: ProjectDiscoveryRepository
    project: ProjectSummary
  } | undefined>
}

export class ProjectRegistrationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export default class RegisterProject {
  constructor(private readonly config: {
    candidates: IProjectCandidateDataSource
    repository: Pick<IProjectDiscoveryRepository, "add">
    repositoryNameSuffix: string
  }) {}

  async register(input: string): Promise<ProjectSummary> {
    const repository = parseGitHubRepository(input)
    if (!repository) throw new ProjectRegistrationError("Enter a GitHub repository URL or owner/repository.", 400)
    const candidate = await this.config.candidates.getProjectCandidate(repository)
    if (!candidate) {
      throw new ProjectRegistrationError("Repository not found, unavailable to your account, or missing its project configuration.", 404)
    }
    this.validateSuffix(candidate.repository.name)
    if (candidate.project.configError) {
      throw new ProjectRegistrationError(`Fix the repository's project configuration before adding it: ${candidate.project.configError}`, 400)
    }
    await this.config.repository.add(candidate.repository)
    return candidate.project
  }

  private validateSuffix(name: string) {
    // Match automatic discovery using GitHub's canonical name, not input casing.
    if (name.endsWith(this.config.repositoryNameSuffix)) {
      throw new ProjectRegistrationError(`Fast-track discovery is only available for repositories without the ${this.config.repositoryNameSuffix} suffix. Repositories with this suffix are discovered automatically.`, 400)
    }
  }
}
