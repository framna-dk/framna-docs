'use client'

import { Suspense } from "react"
import { Typography } from "@mui/material"
import ProjectListFallback from "./ProjectListFallback"
import PopulatedProjectList from "./PopulatedProjectList"
import { useProjectList } from "@/features/projects/view/ProjectListContext"

const ProjectList = () => {
  const { projects, loading } = useProjectList()

  if (loading && projects.length === 0) {
    return <ProjectListFallback />
  }

  return (
    <Suspense fallback={<ProjectListFallback/>}>
     {projects.length > 0 ? <PopulatedProjectList projects={projects} /> : <EmptyProjectList/>}
    </Suspense>
  )
}

export default ProjectList

const EmptyProjectList = () => {
  return (
    <Typography
      variant="body2"
      sx={{
        margin: 2,
        marginBottom: 4
      }}
    >
      Your list of projects is empty.
    </Typography>
  )
}
