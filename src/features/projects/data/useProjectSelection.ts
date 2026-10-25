"use client"

import { useCallback, useMemo } from "react"
import NProgress from "nprogress"
import { useRouter, usePathname } from "next/navigation"
import {
  Project,
  ProjectSummary,
  ProjectNavigator,
  getProjectSelectionFromPath,
  getDefaultSpecification,
  getProjectPath,
  parseProjectRoute
} from "../domain"
import { useProjectDetails } from "../view/ProjectDetailsContext"

export default function useProjectSelection() {
  const router = useRouter()
  const pathname = usePathname()
  const { getProject } = useProjectDetails()

  const projectNavigator = useMemo(() => {
    const pathnameReader = {
      get pathname() {
        return pathname
      }
    }
    return new ProjectNavigator({ router, pathnameReader })
  }, [router, pathname])

  // Parse owner/name from URL to look up the project
  const { owner, name, exactRepository, remainingPath, basePath } = parseProjectRoute(pathname)
  const hasVersionInUrl = remainingPath.length > 0

  // Get project from cache (if loaded).
  // null = fetched but not found; undefined = not yet fetched.
  // Only pass a real Project to the selection logic.
  const cachedProject = owner && name ? getProject(owner, name, exactRepository) : undefined
  const resolvedProject = cachedProject ?? undefined

  // Use existing getProjectSelectionFromPath for full selection logic
  // It handles complex cases like version IDs with slashes, remote versions, etc.
  const selection = resolvedProject
    ? getProjectSelectionFromPath({ projects: [resolvedProject], path: `${getProjectPath(resolvedProject)}${remainingPath}` })
    : { project: undefined, version: undefined, specification: undefined }

  const currentProject = selection.project
  const currentVersion = selection.version
  const currentSpecification = selection.specification

  const navigateToSelectionIfNeeded = useCallback(() => {
    // Only redirect to defaults if URL has no version/spec at all
    // (i.e., user navigated to just /owner/repo)
    if (currentProject && !hasVersionInUrl) {
      const defaultVersion = currentProject.versions[0]
      if (defaultVersion) {
        const defaultSpec = getDefaultSpecification(defaultVersion)
        if (defaultSpec) {
          router.replace(`${getProjectPath(currentProject)}/${encodeURIComponent(defaultVersion.id)}/${encodeURIComponent(defaultSpec.id)}`)
          return
        }
      }
    }

    projectNavigator.navigateIfNeeded({
      projectOwner: currentProject?.owner,
      projectName: currentProject?.name,
      projectPath: currentProject ? getProjectPath(currentProject) : undefined,
      versionId: currentVersion?.id,
      specificationId: currentSpecification?.id
    })
  }, [currentProject, currentVersion, currentSpecification, hasVersionInUrl, projectNavigator, router])

  return {
    get project() {
      return currentProject
    },
    get version() {
      return currentVersion
    },
    get specification() {
      return currentSpecification
    },
    // Immediate selection from URL - doesn't require project details to be loaded
    selectedOwner: owner,
    selectedName: name,
    selectedProjectPath: currentProject ? getProjectPath(currentProject) : basePath,
    selectProject: (project: ProjectSummary | Project) => {
      NProgress.start()
      // Navigate to project base - the page will handle loading details and redirecting
      router.push(getProjectPath(project))
    },
    selectVersion: (versionId: string) => {
      if (!currentProject || !currentSpecification) return
      NProgress.start()
      projectNavigator.navigateToVersion(
        currentProject,
        versionId,
        currentSpecification.name
      )
    },
    selectSpecification: (specificationId: string) => {
      if (!currentProject || !currentVersion) return
      NProgress.start()
      projectNavigator.navigate(
        currentProject.owner,
        currentProject.name,
        currentVersion.id,
        specificationId,
        getProjectPath(currentProject)
      )
    },
    navigateToSelectionIfNeeded
  }
}
