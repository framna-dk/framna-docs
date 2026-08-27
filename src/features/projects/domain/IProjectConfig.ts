import { z } from "zod"

export const ProjectConfigSpecificationSchema = z.object({
  // The path is embedded in GraphQL queries; quotes and backslashes are rejected at this
  // boundary so downstream query building never sees them.
  path: z.string().regex(/^[^"\\]+$/, "must not contain quotes or backslashes"),
  name: z.string().optional()
})

export const ProjectConfigRemoteSpecificationSchema = z.object({
  id: z.coerce.string().optional(),
  name: z.coerce.string(),
  url: z.string(),
  auth: z.object({
    type: z.string(),
    encryptedUsername: z.string(),
    encryptedPassword: z.string()
  }).optional(),
})

export const ProjectConfigRemoteVersionSchema = z.object({
  id: z.coerce.string().optional(),
  name: z.coerce.string(),
  specifications: ProjectConfigRemoteSpecificationSchema.array()
})

export const IProjectConfigSchema = z.object({
  name: z.coerce.string().optional(),
  image: z.string().optional(),
  defaultSpecificationName: z.string().optional(),
  specifications: ProjectConfigSpecificationSchema.array().optional(),
  remoteVersions: ProjectConfigRemoteVersionSchema.array().optional()
})

export type ProjectConfigSpecification = z.infer<typeof ProjectConfigSpecificationSchema>
export type ProjectConfigRemoteSpecification = z.infer<typeof ProjectConfigRemoteSpecificationSchema>
export type ProjectConfigRemoteVersion = z.infer<typeof ProjectConfigRemoteVersionSchema>
export type IProjectConfig = z.infer<typeof IProjectConfigSchema>

export default IProjectConfig
