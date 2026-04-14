"use client"

import SpacedList from "@/common/ui/SpacedList"
import PopulatedProjectList from "./PopulatedProjectList"
import { Skeleton as ProjectListItemSkeleton } from "./ProjectListItem"
import { useProjectList } from "@/features/projects/view/ProjectListContext"

const StaleProjectList = () => {
  const { projects } = useProjectList()
  if (projects.length > 0) {
    return <PopulatedProjectList projects={projects} />
  } else {
    return <LoadingProjectList/>
  }
}

export default StaleProjectList

const LoadingProjectList = () => {
  return (
    <SpacedList itemSpacing={1}>
      {
        [...new Array(6)].map((_, idx) => (
          <ProjectListItemSkeleton key={idx} />
        ))
      }
    </SpacedList>
  )
}