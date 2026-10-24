import { Box, Stack } from "@mui/material"
import SecondarySplitHeader from "@/features/sidebar/view/SecondarySplitHeader"

export default function Page({ children }: { children: React.ReactNode }) {
  return (
    <Stack sx={{ height: { xs: "100dvh", sm: "calc(100dvh - 16px)" }, overflow: "hidden" }}>
      <SecondarySplitHeader/>
      <Box
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflowY: "hidden",
          paddingLeft: 2,
          paddingRight: 2
        }}
      >
        {children}
      </Box>
    </Stack>
  )
}
