import { z } from "zod"

export const ProjectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  owner: z.string(),
  imageURL: z.string().optional(),
  url: z.string().optional(),
  ownerUrl: z.string()
})

type ProjectSummary = z.infer<typeof ProjectSummarySchema>

export default ProjectSummary
