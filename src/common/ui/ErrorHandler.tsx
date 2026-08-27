"use client"

import { useRouter } from "next/navigation"
import { SWRConfig } from "swr"
import { FetcherError } from "@/common"

export default function ErrorHandler({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const onSWRError = (error: FetcherError) => {
    if (typeof window === "undefined") {
      return
    }
    if (error.status == 401) {
      router.push("/api/auth/signout")
    }
  }
  return (
    <SWRConfig value={{ onError: onSWRError }}>
      {children}
    </SWRConfig>
  )
}
