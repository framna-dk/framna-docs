import { z } from "zod"

export const ProjectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string().optional(),
  displayName: z.string(),
  owner: z.string(),
  imageURL: z.string().optional(),
  url: z.string().optional(),
  ownerUrl: z.string(),
  configError: z.string().optional()
})

type ProjectSummary = z.infer<typeof ProjectSummarySchema>

export default ProjectSummary
