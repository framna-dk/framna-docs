"use client"

import { useState } from "react"
import { Box, Tab, Tabs, Typography } from "@mui/material"
import ExistingProjectForm from "./ExistingProjectForm"
import NewProjectSteps from "./NewProjectSteps"

export default function AddProjectOptions(props: {
  repositoryNameSuffix: string
  projectConfigurationFilename: string
  templateName?: string
  ownerRepository?: string
}) {
  const [tab, setTab] = useState(0)
  const configBaseName = props.projectConfigurationFilename.replace(/\.ya?ml$/, "")

  return (
    <Box width={1} maxWidth={640}>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} aria-label="Add project options" variant="fullWidth" sx={{ mb: 4 }}>
        <Tab label="Existing project" id="existing-project-tab" aria-controls="existing-project-panel" />
        <Tab label="Create a new project" id="create-project-tab" aria-controls="create-project-panel" />
      </Tabs>
      {tab === 0 ? (
        <Box role="tabpanel" id="existing-project-panel" aria-labelledby="existing-project-tab" display="flex" flexDirection="column" gap={3}>
          <Box>
            <Typography variant="h6" gutterBottom>Projects are discovered automatically</Typography>
            <Typography color="text.secondary">Repositories you have access to appear in the project list when they:</Typography>
            <Box component="ul" sx={{ listStyleType: "disc", pl: 3, my: 2, "& li": { display: "list-item", mb: 1 } }}>
              <Typography component="li">Have a repository name ending in <strong>{props.repositoryNameSuffix}</strong>.</Typography>
              <Typography component="li">Contain a <strong>{configBaseName}.yml</strong> or <strong>{configBaseName}.yaml</strong> file at the repository root.</Typography>
            </Box>
            <Typography color="text.secondary">
              Config-file discovery relies on GitHub code search, which can take time to index new files. For configured repositories without the {props.repositoryNameSuffix} suffix, you can fast-track discovery below.
            </Typography>
          </Box>
          <ExistingProjectForm />
        </Box>
      ) : (
        <Box role="tabpanel" id="create-project-panel" aria-labelledby="create-project-tab">
          <NewProjectSteps repositoryNameSuffix={props.repositoryNameSuffix} templateName={props.templateName} ownerRepository={props.ownerRepository} />
        </Box>
      )}
    </Box>
  )
}
