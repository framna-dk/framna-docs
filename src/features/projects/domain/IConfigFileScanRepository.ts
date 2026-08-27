import { z } from "zod"

export const ConfigFileScanRepositorySchema = z.object({
  name: z.string(),
  owner: z.object({ login: z.string() }),
  defaultBranchRef: z.object({
    target: z.object({ oid: z.string() })
  }).nullish(),
  configYml: z.object({ text: z.string().optional() }).nullish(),
  configYaml: z.object({ text: z.string().optional() }).nullish()
})

export const ConfigFileScanSchema = z.object({
  scannedAt: z.number(),
  // Every repository seen during the scan as "owner/name", so the next scan can tell
  // repositories it has never probed from ones whose result can be carried over.
  enumeratedRepositories: z.string().array(),
  repositories: ConfigFileScanRepositorySchema.array()
})

export type ConfigFileScan = z.infer<typeof ConfigFileScanSchema>

export default interface IConfigFileScanRepository {
  get(): Promise<ConfigFileScan | undefined>
  set(scan: ConfigFileScan): Promise<void>
  delete(): Promise<void>
}
