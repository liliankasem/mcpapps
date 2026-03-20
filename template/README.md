# <App Name> MCP App

An MCP server built with Azure Functions (.NET 10) that <description of what the app does>.

## Tools

| Tool | Description |
|------|-------------|
| `tool_name` | Description of what the tool does |

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
- [Node.js 18+](https://nodejs.org/) (for building the UI)
- [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) (for deployment)
- [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) (for local storage emulation)

## How to use this template

1. Copy this folder to `src/<YourAppName>/`
2. Rename `McpAppTemplate.csproj` to `<YourAppName>.csproj`
3. Update `azure.yaml` with your app name
4. Update `host.json` MCP extension settings (serverName, instructions, etc.)
5. Add the project to the solution: `dotnet sln McpApps.slnx add src/<YourAppName>/<YourAppName>.csproj`
6. Add your MCP tool functions

## Local Setup

### 1. Configure local settings

Copy the sample settings file and add any app-specific secrets:

```bash
cp local.settings.sample.json local.settings.json
```

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
    "<app-name>-mcp": {
      "type": "sse",
      "url": "http://localhost:7071/runtime/webhooks/mcp/sse"
    }
  }
}
```

## Deployment to Azure

```bash
azd auth login
azd up
```

To redeploy just the app code (without re-provisioning infrastructure):

```bash
azd deploy
```

To deploy with Easy Auth (Microsoft Entra ID), see [Optional Features](../../README.md#optional-features) in the root README.

### Connect to the deployed server

**Without Easy Auth** — use a function key:

```bash
az functionapp keys list \
  --name <function-app-name> \
  --resource-group <resource-group> \
  --query "systemKeys.mcp_extension" -o tsv
```

```json
{
  "servers": {
    "<app-name>-mcp": {
      "type": "sse",
      "url": "https://<function-app-name>.azurewebsites.net/runtime/webhooks/mcp/sse",
      "headers": {
        "x-functions-key": "<function-key>"
      }
    }
  }
}
```

**With Easy Auth** — use Microsoft Entra ID OAuth:

```bash
azd env get-value ENTRA_APPLICATION_ID     # App registration client ID
azd env get-value ENTRA_IDENTIFIER_URI     # Application identifier URI
azd env get-value AZURE_TENANT_ID          # Entra ID tenant ID
azd env get-value SERVICE_DEFAULT_HOSTNAME # Function app hostname
```

```json
{
  "servers": {
    "<app-name>-mcp": {
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

```bash
azd down
```

## Project Structure

```
<AppName>/
├── Program.cs              # Host setup with DI
├── <AppName>Tools.cs       # MCP tool functions
├── <AppName>Resources.cs   # MCP resource serving the UI widget
├── <AppName>.csproj        # Project file with MCP extension references
├── host.json               # Functions host configuration
├── local.settings.sample.json # Sample local settings (copy to local.settings.json)
└── app/                    # Vite + TypeScript UI
    ├── src/<app>-app.ts    # Interactive UI
    ├── index.html          # HTML template with styles
    ├── package.json        # Node dependencies
    ├── vite.config.ts      # Vite config (singlefile plugin)
    └── dist/index.html     # Built output (bundled single file)
```

## Files

| File | Purpose |
|------|---------|
| `McpAppTemplate.csproj` | Project file with MCP extension + worker references |
| `Program.cs` | Host startup with Application Insights |
| `host.json` | Functions host config with MCP extension section |
| `local.settings.sample.json` | Sample local settings (copy to `local.settings.json`) |
| `azure.yaml` | Azure Developer CLI deployment config |
