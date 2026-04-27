import { NextResponse } from "next/server"
import { session, projectDetailsDataSource } from "@/composition"
import { makeUnauthenticatedAPIErrorResponse } from "@/common"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const isAuthenticated = await session.getIsAuthenticated()
  if (!isAuthenticated) {
    return makeUnauthenticatedAPIErrorResponse()
  }
  const { owner, repo } = await params

  try {
    const project = await projectDetailsDataSource.getProjectDetails(owner, repo)

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ project })
  } catch (error) {
    console.error(`Failed to fetch project details for ${owner}/${repo}:`, error)
    return NextResponse.json(
      { error: "Failed to fetch project details" },
      { status: 500 }
    )
  }
}
