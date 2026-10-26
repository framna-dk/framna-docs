"use client"
import {
  Box,
  Typography,
} from "@mui/material"
import NewProjectForm from "./NewProjectForm"
import { splitOwnerAndRepository } from "@/common"
import HighlightText from "@/common/ui/HighlightText"
import { Fragment } from "react"

interface NewProjectStepsProps {
  repositoryNameSuffix: string
  templateName?: string
  ownerRepository?: string
}

type StepType = {
  id?: string,
  content: string,
  highlight: string,
}

const NewProjectSteps = ({
  repositoryNameSuffix,
  templateName,
  ownerRepository,
}: NewProjectStepsProps) => {
  const steps: StepType[] = [
    {
      id: "create-new-repository",
      content: `Create a new repository using our ${templateName ? splitOwnerAndRepository(templateName)?.repository : ""} template.`,
      highlight: "Create a new repository",
    },
    {
      content: "Add your OpenAPI specification.",
      highlight: "OpenAPI specification",
    },
    {
      content: "Ready to browse documentation! 🚀",
      highlight: "Ready",
    }
  ]

  const isCreateRepositoryStep = (step: StepType) => step.id && step.id === steps[0].id

  const getStepContent = (step: StepType, index: number) => (
    <>
      {step.highlight ? 
        <HighlightText
          content={`${index + 1}. ${step.content}`}
          highlight={[step.highlight]}
          variant="body1"
          sx={{ marginRight: { xs: 1 } }}
        /> :
        <Typography
          variant="body1"
          sx={{
            display: { md: "flex" },
            marginRight: { xs: 4 }
          }}
        >
          {`${index + 1}. `}
          {step.content}
        </Typography>
      }
    </>
  )

return (
    <Box display="flex" alignItems="start" flexDirection="column" gap={3} width={1}>
        <Typography variant="h6">Create a new project</Typography>
        {steps.map((step: StepType, index: number) => 
          <Fragment key={`box-step-${index}`}>
            {isCreateRepositoryStep(step) ? 
              <Box display="flex" flexDirection="column" gap={2} width={1}>
                  {getStepContent(step, index)}
                <NewProjectForm
                  repositoryNameSuffix={repositoryNameSuffix}
                  templateName={templateName}
                  ownerRepository={ownerRepository}
                />
              </Box> :
              getStepContent(step, index)
            }
          </Fragment>
        )}
    </Box>
  )}

export default NewProjectSteps
