# GitHub MCP App

An MCP server built with Azure Functions (.NET 10) that provides GitHub tools with an interactive MCP Apps UI. Search repositories, browse issues and PRs, create issues, and view file contents — all through MCP-compatible clients.

## Tools

| Tool | Description |
|------|-------------|
| `search_repos` | Search GitHub repositories by query |
| `get_issues` | List issues for a repository |
| `get_issue_detail` | Get full details for a specific issue (body, labels, assignees, comments) |
| `get_pull_requests` | List pull requests for a repository |
| `get_pr_detail` | Get full details for a specific PR (diff stats, branch info, merge status) |
| `get_file_contents` | Read a file from a repository |
| `get_repo_detail` | Get detailed repository info (stars, forks, topics, license) |
| `create_issue` | Create a new issue in a repository |

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
- [Node.js 18+](https://nodejs.org/) (for building the UI)
- [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) (for deployment)
- A [GitHub Personal Access Token](https://github.com/settings/tokens) (for authenticated API access)

## Local Setup

### 1. Build the UI

```bash
cd app && npm install && npm run build && cd ..
```

This produces `app/dist/index.html`, which is bundled into the function output at build time.

### 2. Configure local settings

Edit `local.settings.json`:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "dotnet-isolated",
    "GITHUB_TOKEN": "<your-github-pat>"
  }
}
```

| Setting | Required | Description |
|---------|----------|-------------|
| `GITHUB_TOKEN` | Recommended | GitHub PAT for authenticated API access. Without it, you'll be rate-limited to 60 requests/hour. |

### 3. Build and run

```bash
dotnet build
func start
```

The MCP server will be available at `http://localhost:7071`.

### 4. Connect an MCP client

Add the server to your MCP client configuration (e.g., VS Code `mcp.json`):

```json
{
  "servers": {
    "github-mcp": {
      "type": "sse",
      "url": "http://localhost:7071/runtime/webhooks/mcp/sse"
    }
  }
}
```

## Deployment to Azure

### Using Azure Developer CLI

From the `src/GitHub` directory:

```bash
azd auth login
azd up
```

This provisions a Flex Consumption Function App with managed identity and deploys the app.

To deploy with Easy Auth (Microsoft Entra ID), see [Optional Features](../../README.md#optional-features) in the root README.

### Configure app settings

After deployment, set the GitHub token in the Function App's application settings:

```bash
az functionapp config appsettings set \
  --name <function-app-name> \
  --resource-group <resource-group> \
  --settings "GITHUB_TOKEN=<your-github-pat>"
```

### Connect to the deployed server

**Without Easy Auth** — use a function key:

```bash
az functionapp keys list \
  --name <function-app-name> \
  --resource-group <resource-group> \
  --query "systemKeys.mcp_extension" -o tsv
```

Or find it in the Azure Portal under **Function App > App keys > System keys > `mcp_extension`**.

```json
{
  "servers": {
    "github-mcp": {
      "type": "sse",
      "url": "https://<function-app-name>.azurewebsites.net/runtime/webhooks/mcp/sse",
      "headers": {
        "x-functions-key": "<function-key>"
      }
    }
  }
}
```

**With Easy Auth** — see [Optional Features](../../README.md#optional-features) to enable, then use Microsoft Entra ID OAuth.

After `azd up`, the deployment outputs provide the values you need:

```bash
azd env get-value ENTRA_APPLICATION_ID     # App registration client ID
azd env get-value ENTRA_IDENTIFIER_URI     # Application identifier URI
azd env get-value AZURE_TENANT_ID          # Entra ID tenant ID
azd env get-value SERVICE_DEFAULT_HOSTNAME # Function app hostname
```

```json
{
  "servers": {
    "github-mcp": {
      "type": "sse",
      "url": "https://<SERVICE_DEFAULT_HOSTNAME>/runtime/webhooks/mcp/sse",
      "oauth": {
        "authority": "https://login.microsoftonline.com/<AZURE_TENANT_ID>",
        "clientId": "<ENTRA_APPLICATION_ID>",
        "scopes": ["<ENTRA_IDENTIFIER_URI>/user_impersonation"]
      }
    }
  }
}
```

## Clean Up

To destroy all Azure resources created by this app:

```bash
azd down
```

## Project Structure

```
GitHub/
├── Program.cs              # Host setup, registers GitHubClient with DI
├── GitHubTools.cs           # MCP tool functions
├── GitHubResources.cs       # MCP resource serving the UI widget
├── GitHub.csproj            # Project file (Octokit, MCP extension)
├── host.json                # Functions host configuration
├── local.settings.json      # Local app settings
└── app/                     # Vite + TypeScript UI
    ├── src/github-app.ts     # Interactive UI with drill-down views
    ├── index.html            # HTML template with styles
    ├── package.json          # Node dependencies
    ├── vite.config.ts        # Vite config (singlefile plugin)
    └── dist/index.html       # Built output (bundled single file)
```
