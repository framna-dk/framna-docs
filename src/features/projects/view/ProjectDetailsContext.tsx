"use client"

import { createContext, useContext } from "react"
import { Project } from "@/features/projects/domain"

export interface ProjectDetailsContextValue {
  getProject: (owner: string, repo: string, exactRepository?: boolean) => Project | null | undefined
  fetchProject: (owner: string, repo: string, exactRepository?: boolean) => Promise<Project | null>
  isLoading: (owner: string, repo: string, exactRepository?: boolean) => boolean
  getError: (owner: string, repo: string, exactRepository?: boolean) => string | null
}

export const ProjectDetailsContext = createContext<ProjectDetailsContextValue | null>(null)

export function useProjectDetails() {
  const context = useContext(ProjectDetailsContext)
  if (!context) {
    throw new Error("useProjectDetails must be used within ProjectDetailsContextProvider")
  }
  return context
}
