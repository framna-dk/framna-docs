"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { ProjectSummary } from "@/features/projects/domain"
import { ProjectListContext } from "./ProjectListContext"
import ProjectListState from "../domain/ProjectListState"

export default function ProjectListContextProvider({
  children
}: {
  children: React.ReactNode
}) {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isRefreshingRef = useRef(false)
  const listState = useRef(new ProjectListState()).current

  const addProject = useCallback((project: ProjectSummary) => {
    setProjects(listState.addProject(project))
    setError(null)
  }, [listState])

  const fetchProjects = useCallback(async (forceRefresh: boolean): Promise<ProjectSummary[] | null> => {
    const request = listState.beginRequest()
    const url = forceRefresh ? "/api/projects?refresh=true" : "/api/projects"
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { projects: newProjects } = await res.json()
      const applied = listState.applyResponse(request, newProjects || [])
      if (!applied) return null
      setProjects(applied)
      setError(null)
      return applied
    } catch (error) {
      if (listState.isCurrent(request)) throw error
      return null
    }
  }, [listState])

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
      refresh()
    }
    load()
  }, [fetchProjects, refresh])

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
