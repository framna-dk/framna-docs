"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import ErrorMessage from "@/common/ui/ErrorMessage"
import { updateWindowTitle, parseProjectRoute } from "@/features/projects/domain"
import { useProjectSelection } from "@/features/projects/data"
import Documentation from "@/features/projects/view/Documentation"
import NotFound from "@/features/projects/view/NotFound"
import { useProjectDetails } from "@/features/projects/view/ProjectDetailsContext"
import LoadingIndicator from "@/common/ui/LoadingIndicator"

export default function Page() {
  const { owner, name, exactRepository } = parseProjectRoute(usePathname())

  const { fetchProject, isLoading, getError, getProject } = useProjectDetails()
  const { project, version, specification, navigateToSelectionIfNeeded } = useProjectSelection()

  const loading = owner && name ? isLoading(owner, name, exactRepository) : false
  const error = owner && name ? getError(owner, name, exactRepository) : null

  // cachedProject distinguishes not-yet-fetched (undefined) from not-found (null).
  // useProjectSelection converts null→undefined, so we read the cache directly here.
  const cachedProject = owner && name ? getProject(owner, name, exactRepository) : undefined

  // Fetch project details when the page loads.
  // Only fetch when the project is undefined (not yet requested).
  // A null value means it was fetched and not found — don't retry.
  useEffect(() => {
    if (owner && name && cachedProject === undefined && !loading) {
      fetchProject(owner, name, exactRepository)
    }
  }, [owner, name, exactRepository, loading, cachedProject, fetchProject])

  // Ensure the URL reflects the current selection of project, version, and specification.
  useEffect(() => {
    navigateToSelectionIfNeeded()
  }, [project, version, specification, navigateToSelectionIfNeeded])

  useEffect(() => {
    if (!project) {
      return
    }
    updateWindowTitle({
      storage: document,
      project,
      version,
      specification
    })
  }, [project, version, specification])

  // Incomplete /repos/ links are invalid, not a pending project lookup.
  if (!owner || !name) return <NotFound/>

  if (loading || (cachedProject === undefined && !error)) {
    return <LoadingIndicator />
  }

  if (error) {
    return <ErrorMessage text={error} />
  }

  return (
    <>
      {project && version && specification &&
        <Documentation url={specification.url} />
      }
      {project && (!version || !specification) &&
        <ErrorMessage text={`The selected ${!version ? "branch or tag" : "specification"} was not found.`}/>
      }
      {cachedProject === null && <NotFound/>}
    </>
  )
}
