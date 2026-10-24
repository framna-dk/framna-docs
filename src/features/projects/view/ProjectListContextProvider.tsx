"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { ProjectSummary } from "@/features/projects/domain"
import { ProjectListContext } from "./ProjectListContext"

export default function ProjectListContextProvider({
  children
}: {
  children: React.ReactNode
}) {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isRefreshingRef = useRef(false)
  const addedProjectVersionRef = useRef(0)
  const addedProjectsRef = useRef(new Map<string, { project: ProjectSummary; version: number }>())

  const addProject = useCallback((project: ProjectSummary) => {
    addedProjectsRef.current.set(project.id, { project, version: ++addedProjectVersionRef.current })
    setProjects(current => [...current.filter(item => item.id !== project.id), project]
      .sort((a, b) => a.displayName.localeCompare(b.displayName)))
    setError(null)
  }, [])

  const fetchProjects = useCallback(async (forceRefresh: boolean): Promise<ProjectSummary[] | null> => {
    const versionAtStart = addedProjectVersionRef.current
    const url = forceRefresh ? "/api/projects?refresh=true" : "/api/projects"
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { projects: newProjects } = await res.json()
    const merged = new Map<string, ProjectSummary>((newProjects || []).map((project: ProjectSummary) => [project.id, project]))
    addedProjectsRef.current.forEach(({ project, version }, id) => {
      // Keep a just-added project if a request started before registration completed.
      // Later refreshes are authoritative, including changes to GitHub access.
      if (merged.has(id) || version <= versionAtStart) addedProjectsRef.current.delete(id)
      else merged.set(id, project)
    })
    setProjects(Array.from(merged.values()).sort((a, b) => a.displayName.localeCompare(b.displayName)))
    setError(null)
    return newProjects || []
  }, [])

  const refresh = useCallback(() => {
    if (isRefreshingRef.current) return
    isRefreshingRef.current = true
    fetchProjects(true)
      .catch(err => console.error("Failed to refresh project list:", err))
      .finally(() => { isRefreshingRef.current = false })
  }, [fetchProjects])

  // Initial load: show cached data immediately, then refresh in the background
  useEffect(() => {
    const load = async () => {
      try {
        await fetchProjects(false)
      } catch (err) {
        console.error("Failed to fetch project list:", err)
        setError("Failed to load projects")
      } finally {
        setLoading(false)
      }
      fetchProjects(true).catch(err =>
        console.error("Failed to refresh project list:", err)
      )
    }
    load()
  }, [fetchProjects])

  // Refresh on visibility change and focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) refresh()
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", refresh)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", refresh)
    }
  }, [refresh])

  return (
    <ProjectListContext.Provider value={{ projects, loading, error, refresh, addProject }}>
      {children}
    </ProjectListContext.Provider>
  )
}
