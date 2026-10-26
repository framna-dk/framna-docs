"use client"
import SpacedList from "@/common/ui/SpacedList"
import { ProjectSummary, getProjectPath } from "@/features/projects/domain"
import ProjectListItem from "./ProjectListItem"

const PopulatedProjectList = ({ projects }: { projects: ProjectSummary[] }) => {
  return (
    <SpacedList itemSpacing={1}>
      {projects.map(project => (
        <ProjectListItem key={getProjectPath(project).toLowerCase()} project={project} />
      ))}
    </SpacedList>
  )
}

export default PopulatedProjectList
