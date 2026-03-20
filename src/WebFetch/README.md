# WebFetch MCP App

An MCP server built with Azure Functions (.NET 10) that fetches web pages and extracts content. Returns page content as markdown and lists extracted links — with an interactive MCP Apps UI where clicking links fetches their content.

## Tools

| Tool | Description |
|------|-------------|
| `fetch_url` | Fetch a URL and return its content as markdown |
| `list_links` | Extract and list all links from a web page |

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
- [Node.js 18+](https://nodejs.org/) (for building the UI)
- [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) (for deployment)
- [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) (for local storage emulation)

## Local Setup

### 1. Configure local settings

Copy the sample settings file:

```bash
cp local.settings.sample.json local.settings.json
```

No additional configuration is needed — the app uses `HttpClient` to fetch URLs.

### 2. Start Azurite (for local storage emulation)

```bash
azurite --silent
```

### 3. Build and run

```bash
# Build the UI widget (produces app/dist/index.html, bundled into function output at build time)
cd app && npm install && npm run build && cd ..

# Start the function app
func start
```

The MCP server will be available at `http://localhost:7071`.

### 4. Connect an MCP client

Add the server to your MCP client configuration (e.g., VS Code `mcp.json`):

```json
{
  "servers": {
    "webfetch-mcp": {
      "type": "sse",
      "url": "http://localhost:7071/runtime/webhooks/mcp/sse"
    }
  }
}
```

## Deployment to Azure

### Using Azure Developer CLI

From the `src/WebFetch` directory:

```bash
azd auth login
azd up
```

This provisions a Flex Consumption Function App with managed identity and deploys the app.

To redeploy just the app code (without re-provisioning infrastructure):

```bash
azd deploy
```

To deploy with Easy Auth (Microsoft Entra ID), see [Optional Features](../../README.md#optional-features) in the root README.

### Connect to the deployed server

Get the function key (the `default` host key):

```bash
az functionapp keys list \
  --name <function-app-name> \
  --resource-group <resource-group> \
  --query "systemKeys.mcp_extension" -o tsv
```

Or find it in the Azure Portal under **Function App > App keys > System keys > `mcp_extension`**.

Then configure your MCP client:

```json
{
  "servers": {
    "webfetch-mcp": {
      "type": "sse",
      "url": "https://<function-app-name>.azurewebsites.net/runtime/webhooks/mcp/sse",
      "headers": {
        "x-functions-key": "<function-key>"
      }
    }
  }
}
```

**With Easy Auth** — see [Optional Features](../../README.md#optional-features) to enable, then use Microsoft Entra ID OAuth:

```bash
azd env get-value ENTRA_APPLICATION_ID     # App registration client ID
azd env get-value ENTRA_IDENTIFIER_URI     # Application identifier URI
azd env get-value AZURE_TENANT_ID          # Entra ID tenant ID
azd env get-value SERVICE_DEFAULT_HOSTNAME # Function app hostname
```

```json
{
  "servers": {
    "webfetch-mcp": {
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
WebFetch/
├── Program.cs              # Host setup, registers HttpClient with DI
├── WebFetchTools.cs         # MCP tool functions (fetch_url, list_links)
├── WebFetchResources.cs     # MCP resource serving the UI widget
├── WebFetch.csproj          # Project file (ReverseMarkdown, MCP extension)
├── host.json                # Functions host configuration
├── local.settings.json      # Local app settings
└── app/                     # Vite + TypeScript UI
    ├── src/webfetch-app.ts  # Interactive UI with link click-through
    ├── index.html           # HTML template with styles
    ├── package.json          # Node dependencies
    ├── vite.config.ts        # Vite config (singlefile plugin)
    └── dist/index.html       # Built output (bundled single file)
```
