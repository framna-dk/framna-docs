export default class RepositoryNameEventFilter {
  private readonly allowlist: string[]
  private readonly disallowlist: string[]
  
  constructor(config: {
    allowlist: string[]
    disallowlist: string[]
  }) {
    this.allowlist = config.allowlist
    this.disallowlist = config.disallowlist
  }
  
  includeEvent(event: { repositoryOwner: string, repositoryName: string }) {
    const fullRepositoryName = `${event.repositoryOwner}/${event.repositoryName}`
    if (!this.isAllowedRepositoryName(fullRepositoryName)) {
      return false
    }
    if (this.isDisallowedRepositoryName(fullRepositoryName)) {
      return false
    }
    return true
  }
  
  private isAllowedRepositoryName(repositoryName: string) {
    if (this.allowlist.length == 0) {
      return true
    }
    return this.allowlist.includes(repositoryName)
  }
  
  private isDisallowedRepositoryName(repositoryName: string) {
    return this.disallowlist.includes(repositoryName)
  }
}
