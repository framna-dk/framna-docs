import { IGitHubClient, PullRequestFile, ProjectRepositoryNaming } from "@/common"
import { ProjectConfigParser } from "@/features/projects/domain"

export default class PullRequestCommenter {
  private readonly domain: string
  private readonly siteName: string
  private readonly gitHubAppId: string
  private readonly gitHubClient: IGitHubClient
  private readonly naming: ProjectRepositoryNaming
  
  constructor(config: {
    domain: string
    siteName: string
    repositoryNameSuffix: string
    projectConfigurationFilename: string
    gitHubAppId: string
    gitHubClient: IGitHubClient
  }) {
    this.domain = config.domain
    this.siteName = config.siteName
    this.gitHubAppId = config.gitHubAppId
    this.gitHubClient = config.gitHubClient
    this.naming = new ProjectRepositoryNaming(config)
  }
  
  async commentPullRequest(request: {
    appInstallationId: number
    repositoryOwner: string
    repositoryName: string
    ref: string
    pullRequestNumber: number
  }) {
    // Match the portal's opt-in and config selection on the default branch. Webhook
    // requests have no user session, so this query uses the installation token.
    const response = await this.gitHubClient.graphql({
      appInstallationId: request.appInstallationId,
      query: `query PreviewConfiguration($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          configYml: object(expression: ${JSON.stringify(`HEAD:${this.naming.configFileYml}`)}) { ... on Blob { text } }
          configYaml: object(expression: ${JSON.stringify(`HEAD:${this.naming.configFileYaml}`)}) { ... on Blob { text } }
        }
      }`,
      variables: { owner: request.repositoryOwner, name: request.repositoryName }
    })
    const configBlob = response.repository?.configYml || response.repository?.configYaml
    if (!this.naming.hasSuffix(request.repositoryName) && !configBlob) return
    const config = configBlob?.text
      ? new ProjectConfigParser().tryParse(configBlob.text).config
      : null
    const files = this.getChangedFiles(await this.gitHubClient.getPullRequestFiles(request), config?.specifications)
    const commentBody = this.makeCommentBody({
      files,
      owner: request.repositoryOwner,
      repositoryName: request.repositoryName,
      ref: request.ref
    })
    const existingComment = await this.getExistingComment(request)
    if (existingComment && existingComment.body !== commentBody) {
      await this.gitHubClient.updatePullRequestComment({
        appInstallationId: request.appInstallationId,
        commentId: existingComment.id,
        repositoryOwner: request.repositoryOwner,
        repositoryName: request.repositoryName,
        body: commentBody
      })
    } else if (!existingComment && files.length > 0) {
      await this.gitHubClient.addCommentToPullRequest({
        appInstallationId: request.appInstallationId,
        repositoryOwner: request.repositoryOwner,
        repositoryName: request.repositoryName,
        pullRequestNumber: request.pullRequestNumber,
        body: commentBody
      })
    }
  }
  
  private getChangedFiles(files: PullRequestFile[], specifications?: { path: string }[]) {
    return files
      .filter(file => file.status != "unchanged")
      .filter(file => {
        if (this.isProjectConfigurationFile(file.filename)) return true
        if (specifications?.length) return specifications.some(spec => spec.path === file.filename)
        return !file.filename.startsWith(".") && !file.filename.includes("/") && /\.ya?ml$/.test(file.filename)
      })
  }
  
  private async getExistingComment(request: {
    appInstallationId: number,
    repositoryOwner: string
    repositoryName: string
    pullRequestNumber: number
  }) {
    const comments = await this.gitHubClient.getPullRequestComments({
      appInstallationId: request.appInstallationId,
      repositoryOwner: request.repositoryOwner,
      repositoryName: request.repositoryName,
      pullRequestNumber: request.pullRequestNumber,
    })
    return comments.find(comment => {
      return comment.isFromBot && comment.gitHubApp?.id == this.gitHubAppId
    })
  }
  
  private makeCommentBody(params: {
    files: PullRequestFile[]
    owner: string
    repositoryName: string
    ref: string
  }): string {
    const { owner, repositoryName, ref } = params
    const projectId = this.getProjectId({ repositoryName })
    const tableHTML = this.makeFileTableHTML(params)
    let result = "### 📖 Documentation Preview"
    result += "\n\n"
    result += `The changes are now ready to previewed on <a href="${this.domain}/${owner}/${projectId}/${ref}">${this.siteName}</a> 🚀`
    if (tableHTML) {
      result += "\n\n" + tableHTML
   }
    return result
  }
  
  private makeFileTableHTML(params: {
    files: PullRequestFile[]
    owner: string
    repositoryName: string
    ref: string
  }) {
    const { files, owner, repositoryName, ref } = params
    const rows: { filename: string, status: string, button: string }[] = []
    const projectId = this.getProjectId({ repositoryName })
    // Create rows for each file
    for (const file of files) {
      const status = this.getStatusText(file)
      let button = ""
      if (file.status != "removed") {
        let link = `${this.domain}/${owner}/${projectId}/${ref}`
        if (!this.isProjectConfigurationFile(file.filename)) {
          link += `/${encodeURIComponent(file.filename)}`
        }
        button = ` <a href="${link}">Preview</a>`
      }
      rows.push({ filename: file.filename, status, button })
    }
    if (rows.length == 0) {
      return undefined
    }
    const rowsHTML = rows
      .map(row => `<tr><td><strong>${row.filename}</strong></td><td>${row.status}</td><td>${row.button}</td></tr>`)
      .join("\n")
    return `<table>${rowsHTML}</table>`
  }
  
  private getStatusText(file: PullRequestFile) {
    if (file.status == "added") {
      return "Added"
    } else if (file.status == "removed") {
      return "Removed"
    } else if (file.status == "renamed") {
      return "Renamed"
    } else if (file.status == "changed" || file.status == "modified") {
      return "Changed"
    } else {
      return ""
    }
  }
  
  private getProjectId({ repositoryName }: { repositoryName: string }): string {
    return this.naming.projectName(repositoryName)
  }
  
  private isProjectConfigurationFile(filename: string) {
    return this.naming.configFileVariants.includes(filename)
  }
}
