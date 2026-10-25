"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Alert, Box, Button, TextField, Typography } from "@mui/material"
import { useProjectList } from "@/features/projects/view/ProjectListContext"
import { getProjectPath } from "@/features/projects/domain"

export default function ExistingProjectForm() {
  const router = useRouter()
  const { addProject } = useProjectList()
  const [repository, setRepository] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "We couldn't add the project. Please try again.")
      addProject(result.project)
      router.push(getProjectPath(result.project))
    } catch (error) {
      setError(error instanceof Error ? error.message : "We couldn't add the project. Please try again.")
      setSubmitting(false)
    }
  }

  return (
    <Box component="form" onSubmit={submit} display="flex" flexDirection="column" gap={2}>
      <Typography variant="h6">Fast-track discovery</Typography>
      <Typography color="text.secondary">
        Already set up your repository but don’t see it in the project list? Add it here to skip the wait.
      </Typography>
      <TextField
        label="GitHub repository"
        placeholder="https://github.com/acme/aurora"
        helperText="Paste a GitHub repository URL or enter owner/repository."
        value={repository}
        onChange={event => { setRepository(event.target.value); setError(null) }}
        disabled={submitting}
        autoComplete="off"
        required
        fullWidth
        inputProps={{ maxLength: 500 }}
      />
      {error && <Alert severity="error">{error}</Alert>}
      <Button type="submit" variant="contained" size="large" sx={{ minHeight: 48 }} disabled={!repository.trim() || submitting}>
        {submitting ? "Checking repository…" : "Fast-track discovery"}
      </Button>
    </Box>
  )
}
