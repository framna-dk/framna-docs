"use client"

import { useEffect } from "react"
import { useParams } from "next/navigation"
import ErrorMessage from "@/common/ui/ErrorMessage"
import { updateWindowTitle } from "@/features/projects/domain"
import { useProjectSelection } from "@/features/projects/data"
import Documentation from "@/features/projects/view/Documentation"
import NotFound from "@/features/projects/view/NotFound"
import { useProjectDetails } from "@/features/projects/view/ProjectDetailsContext"
import LoadingIndicator from "@/common/ui/LoadingIndicator"

export default function Page() {
  const params = useParams()
  const slug = params.slug as string[] | undefined
  const owner = slug?.[0]
  const name = slug?.[1]

  const { fetchProject, isLoading, getError, getProject } = useProjectDetails()
  const { project, version, specification, navigateToSelectionIfNeeded } = useProjectSelection()

  const loading = owner && name ? isLoading(owner, name) : false
  const error = owner && name ? getError(owner, name) : null

  // cachedProject distinguishes not-yet-fetched (undefined) from not-found (null).
  // useProjectSelection converts null→undefined, so we read the cache directly here.
  const cachedProject = owner && name ? getProject(owner, name) : undefined

  // Fetch project details when the page loads.
  // Only fetch when the project is undefined (not yet requested).
  // A null value means it was fetched and not found — don't retry.
  useEffect(() => {
    if (owner && name && cachedProject === undefined && !loading) {
      fetchProject(owner, name)
    }
  }, [owner, name, loading, cachedProject, fetchProject])

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
