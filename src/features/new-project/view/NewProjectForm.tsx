"use client"

import { Box, TextField, InputAdornment, Button } from "@mui/material"
import { useState } from "react"
import { makeFullRepositoryName } from "@/common/utils/makeFullRepositoryName"
import { makeNewGitHubRepositoryLink } from "@/common/utils/makeNewGitHubRepositoryLink"
import Link from "next/link"

interface NewProjectFormProps {
  repositoryNameSuffix: string
  templateName?: string
  ownerRepository?: string
}

export default function NewProjectForm({ repositoryNameSuffix, templateName }: NewProjectFormProps) {
  const [projectName, setProjectName] = useState("")
  const isValid = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(projectName)
  const hasError = projectName.length > 0 && !isValid
  const suffixedRepositoryName = makeFullRepositoryName({ name: projectName, suffix: repositoryNameSuffix })
  const newGitHubRepositoryLink = makeNewGitHubRepositoryLink({
    templateName,
    repositoryName: suffixedRepositoryName,
    description: `Contains OpenAPI specifications for ${projectName}`
  })

  return (
    <Box display="flex" flexDirection="column" gap={2} width={1}>
      <TextField
        id="project-name"
        label="Project name"
        placeholder="project-name"
        value={projectName}
        onChange={event => setProjectName(event.target.value)}
        error={hasError}
        helperText={hasError
          ? "Use 1–100 letters, numbers, hyphens or underscores, starting with a letter or number."
          : "Choose a name for your new repository."}
        InputProps={{ endAdornment: <InputAdornment position="end">{repositoryNameSuffix}</InputAdornment> }}
        fullWidth
      />
      <Button
        id="create-repository"
        disabled={!isValid}
        component={Link}
        href={newGitHubRepositoryLink}
        target="_blank"
        rel="noopener noreferrer"
        variant="contained"
        size="large"
        sx={{ minHeight: 48, width: 1 }}
        disableElevation
      >
        Create repository
      </Button>
    </Box>
  )
}
