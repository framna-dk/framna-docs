"use client"

import { createContext, useContext } from "react"
import { ProjectSummary } from "@/features/projects/domain"

export interface ProjectListContextValue {
  projects: ProjectSummary[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export const ProjectListContext = createContext<ProjectListContextValue | null>(null)

export function useProjectList() {
  const context = useContext(ProjectListContext)
  if (!context) {
    throw new Error("useProjectList must be used within ProjectListContextProvider")
  }
  return context
}
