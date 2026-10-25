import { z } from "zod"
import { VersionSchema } from "./Version"

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string().optional(),
  displayName: z.string(),
  versions: VersionSchema.array(),
  imageURL: z.string().optional(),
  url: z.string().optional(),
  owner: z.string(),
  ownerUrl: z.string()
})

type Project = z.infer<typeof ProjectSchema>

export default Project
