"use client"

import { useRouter, usePathname } from "next/navigation"
import { Stack, List } from "@mui/material"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faPlus } from "@fortawesome/free-solid-svg-icons"
import * as NProgress from "nprogress"
import { Template as ProjectListItemTemplate } from "./projects/ProjectListItem"
import { Squircle as ProjectAvatarSquircle } from "./projects/ProjectAvatar"
import useCloseSidebarOnSelection from "@/features/sidebar/data/useCloseSidebarOnSelection"

const NewProjectButton = () => {
  const router = useRouter()
  const pathname = usePathname()
  const { closeSidebarIfNeeded } = useCloseSidebarOnSelection()
  return (
    <List disablePadding sx={{ margin: 0 }}>
      <ProjectListItemTemplate
        title="Add project"
        selected={pathname === "/new"}
        avatar={
          <ProjectAvatarSquircle
            width={40}
            height={40}
            sx={{ background: "#dfdfdf" }}
          >
            <Stack
              sx={{ height: "100%" }}
              justifyContent="center"
              alignItems="center"
            >
              <FontAwesomeIcon icon={faPlus} size="lg" color="#bababa" />
            </Stack>
          </ProjectAvatarSquircle>
        }
        onSelect={() => {
          closeSidebarIfNeeded()
          NProgress.start()
          router.push("/new")
        }}
      />
    </List>
  )
}

export default NewProjectButton
