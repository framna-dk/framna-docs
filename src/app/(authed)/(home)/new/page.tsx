import { Box, Typography } from "@mui/material"
import { env, splitOwnerAndRepository } from "@/common"
import MessageLinkFooter from "@/common/ui/MessageLinkFooter"
import dynamic from 'next/dynamic'

const HELP_URL = env.get("FRAMNA_DOCS_HELP_URL")

const AddProjectOptions = dynamic(() => import("@/features/new-project/view/AddProjectOptions"))

const Page = () => {
  const repositoryNameSuffix = env.getOrThrow("REPOSITORY_NAME_SUFFIX")
  const templateName = env.get("NEW_PROJECT_TEMPLATE_REPOSITORY")
  const ownerRepository = templateName ? splitOwnerAndRepository(templateName)?.owner : undefined
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="flex-start"
      flexDirection="column"
      height={1}
      width={1}
      gap={4}
      sx={{ p: { xs: 3, md: 5 }, overflowY: "auto", scrollbarGutter: "stable", "& > *": { flexShrink: 0 } }}
    >
      <Typography variant="h4">
        Add project
      </Typography>
      <AddProjectOptions
        repositoryNameSuffix={repositoryNameSuffix}
        projectConfigurationFilename={env.getOrThrow("FRAMNA_DOCS_PROJECT_CONFIGURATION_FILENAME")}
        templateName={templateName}
        ownerRepository={ownerRepository}
      />
      {HELP_URL && 
        <MessageLinkFooter
          url={HELP_URL}
          content="Need help? Explore our wiki for more info."
        />
      }
    </Box>
  )
}

export default Page
