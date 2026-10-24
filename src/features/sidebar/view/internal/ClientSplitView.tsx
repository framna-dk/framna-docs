"use client"

import { useEffect, useContext } from "react"
import { Stack, useMediaQuery, useTheme } from "@mui/material"
import { isMac, useKeyboardShortcut, SidebarTogglableContext } from "@/common"
import { useSidebarOpen } from "../../data"
import useDiffbarOpen from "../../data/useDiffbarOpen"
import { useProjectSelection } from "@/features/projects/data"
import ClientSplitViewTransitionContext from "./ClientSplitViewTransitionContext"
import useClientSplitViewTransitionEnabled from "./useClientSplitViewTransitionEnabled"
import PrimaryContainer from "./primary/Container"
import SecondaryContainer from "./secondary/Container"
import RightContainer from "./tertiary/RightContainer"

const isDiffFeatureEnabled = process.env.NEXT_PUBLIC_ENABLE_DIFF_SIDEBAR === "true"

const ClientSplitView = ({
  sidebar,
  children,
  sidebarRight
}: {
  sidebar: React.ReactNode
  children?: React.ReactNode
  sidebarRight?: React.ReactNode
}) => {
  const { isMounted, isTransitionsEnabled } = useClientSplitViewTransitionEnabled()
  const [isSidebarOpen, setSidebarOpen] = useSidebarOpen()
  const [isRightSidebarOpen, setRightSidebarOpen] = useDiffbarOpen()
  const { specification } = useProjectSelection()
  const diffUrl = specification?.diffURL
  const isSidebarTogglable = useContext(SidebarTogglableContext)
  const theme = useTheme()
  // Determine if the screen size is small or larger
  const isSM = useMediaQuery(theme.breakpoints.up("sm"))

  useEffect(() => {
    if (!isSidebarTogglable && !isSidebarOpen) {
      setSidebarOpen(true)
    }
  }, [isSidebarOpen, isSidebarTogglable, setSidebarOpen])

  // Match the changes pane to the selected specification when navigating.
  useEffect(() => {
    if (isDiffFeatureEnabled) {
      setRightSidebarOpen(Boolean(diffUrl))
    }
  }, [diffUrl, setRightSidebarOpen])

  // Close diff sidebar if no specification is selected
  useEffect(() => {
    if (!specification && isRightSidebarOpen) {
      setRightSidebarOpen(false)
    }
  }, [specification, isRightSidebarOpen, setRightSidebarOpen])
  useKeyboardShortcut(event => {
    const isActionKey = isMac() ? event.metaKey : event.ctrlKey
    if (isActionKey && event.key === ".") {
      event.preventDefault()
      if (isSidebarTogglable) {
        setSidebarOpen(!isSidebarOpen)
      }
    }
  }, [isSidebarTogglable, setSidebarOpen])
  
  useKeyboardShortcut(event => {
    const isActionKey = isMac() ? event.metaKey : event.ctrlKey
    if (isDiffFeatureEnabled && isActionKey && event.key === "k") {
      event.preventDefault()
      setRightSidebarOpen(!isRightSidebarOpen)
    }
  }, [isRightSidebarOpen, setRightSidebarOpen])
  
  const sidebarWidth = 320
  const diffWidth = 320

  return (
    <ClientSplitViewTransitionContext.Provider value={{
      isTransitionsEnabled
    }}>
      <Stack
        direction="row"
        spacing={0}
        sx={{
          width: "100%",
          height: "100%",
          visibility: isMounted ? "visible" : "hidden"
        }}
      >
        <PrimaryContainer
          width={sidebarWidth}
          isOpen={isSidebarOpen}
          onClose={() => setSidebarOpen(false)}
        >
          {sidebar}
        </PrimaryContainer>
        <SecondaryContainer
          isSM={isSM}
          sidebarWidth={sidebarWidth}
          offsetContent={isSidebarOpen}
          diffWidth={diffWidth}
          offsetDiffContent={isRightSidebarOpen}
        >
          {children}
        </SecondaryContainer>
        <RightContainer
          width={diffWidth}
          isOpen={isRightSidebarOpen}
          onClose={() => setRightSidebarOpen(false)}
        >
          {sidebarRight}
        </RightContainer>
      </Stack>
    </ClientSplitViewTransitionContext.Provider>
  )
}

export default ClientSplitView
