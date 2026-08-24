/**
 * The naming convention that marks a repository as participating in Framna Docs.
 *
 * A repository opts in either by carrying the repository name suffix or by containing
 * the project configuration file (in its .yml or .yaml variant). This object is the
 * single home for that rule so project discovery, project details, and the
 * content-serving guard cannot drift apart.
 */
export default class ProjectRepositoryNaming {
  readonly suffix: string
  readonly configFileBaseName: string
  readonly configFileYml: string
  readonly configFileYaml: string

  constructor(config: {
    repositoryNameSuffix: string
    projectConfigurationFilename: string
  }) {
    this.suffix = config.repositoryNameSuffix
    this.configFileBaseName = config.projectConfigurationFilename.replace(/\.ya?ml$/, "")
    this.configFileYml = `${this.configFileBaseName}.yml`
    this.configFileYaml = `${this.configFileBaseName}.yaml`
  }

  get configFileVariants(): string[] {
    return [this.configFileYml, this.configFileYaml]
  }

  hasSuffix(repositoryName: string): boolean {
    return repositoryName.endsWith(this.suffix)
  }

  suffixedName(repositoryName: string): string {
    return this.hasSuffix(repositoryName) ? repositoryName : `${repositoryName}${this.suffix}`
  }

  projectName(repositoryName: string): string {
    return this.hasSuffix(repositoryName)
      ? repositoryName.slice(0, repositoryName.length - this.suffix.length)
      : repositoryName
  }
}
