export type ProjectDiscoveryRepository = {
  readonly owner: string
  readonly name: string
}

export default interface IProjectDiscoveryRepository {
  getRepositories(): Promise<ProjectDiscoveryRepository[]>
}
