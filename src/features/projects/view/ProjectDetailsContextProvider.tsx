"use client"

import { useState, useCallback, useRef } from "react"
import { Project } from "@/features/projects/domain"
import { ProjectDetailsContext } from "./ProjectDetailsContext"

type CacheEntry = {
  project: Project | null
  loading: boolean
  error: string | null
}

export default function ProjectDetailsContextProvider({
  children
}: {
  children: React.ReactNode
}) {
  const [cache, setCache] = useState<Map<string, CacheEntry>>(new Map())
  const inFlightRef = useRef<Map<string, Promise<Project | null>>>(new Map())

  const makeKey = (owner: string, repo: string) => `${owner}/${repo}`

  // Note: These callbacks intentionally include `cache` in deps to trigger
  // re-renders in consuming components when cache updates
  const getProject = useCallback((owner: string, repo: string): Project | null | undefined => {
    const entry = cache.get(makeKey(owner, repo))
    if (!entry) return undefined  // not yet fetched
    return entry.project           // null = fetched, not found; Project = fetched, found
  }, [cache])

  const isLoading = useCallback((owner: string, repo: string): boolean => {
    return cache.get(makeKey(owner, repo))?.loading ?? false
  }, [cache])

  const getError = useCallback((owner: string, repo: string): string | null => {
    return cache.get(makeKey(owner, repo))?.error ?? null
  }, [cache])

  const fetchProject = useCallback(async (owner: string, repo: string): Promise<Project | null> => {
    const key = makeKey(owner, repo)

    // Return in-flight request if exists
    const inFlight = inFlightRef.current.get(key)
    if (inFlight) return inFlight

    // Mark as loading
    setCache(prev => {
      const next = new Map(prev)
      next.set(key, { project: prev.get(key)?.project ?? null, loading: true, error: null })
      return next
    })

    const promise = fetch(`/api/projects/${owner}/${repo}`)
      .then((res): Promise<{ project: Project | null }> | { project: null } => {
        if (res.status === 404) {
          // Project not found - treat as null project, not an error
          return { project: null }
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{ project: Project }>
      })
      .then(({ project }: { project: Project | null }) => {
        setCache(prev => {
          const next = new Map(prev)
          next.set(key, { project, loading: false, error: null })
          return next
        })
        return project
      })
      .catch(err => {
        console.error(`Failed to fetch project ${key}:`, err)
        setCache(prev => {
          const next = new Map(prev)
          next.set(key, { project: null, loading: false, error: "Failed to load project" })
          return next
        })
        return null
      })
      .finally(() => {
        inFlightRef.current.delete(key)
      })

    inFlightRef.current.set(key, promise)
    return promise
  }, [])

  return (
    <ProjectDetailsContext.Provider value={{ getProject, fetchProject, isLoading, getError }}>
      {children}
    </ProjectDetailsContext.Provider>
  )
}
