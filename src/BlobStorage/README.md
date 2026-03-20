# Blob Storage MCP App

An MCP server built with Azure Functions (.NET 10) that provides Azure Blob Storage tools with an interactive MCP Apps UI. Browse containers, view blobs, read content (text and binary), write blobs, and delete blobs — with click-through navigation in the UI.

## Tools

| Tool | Description |
|------|-------------|
| `list_containers` | List all blob containers in the storage account |
| `list_blobs` | List blobs in a container (with optional prefix filter) |
| `read_blob` | Read a blob's content (text rendered directly, binary shown as hex preview) |
| `write_blob` | Write text content to a blob |
| `delete_blob` | Delete a blob from a container |

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
- [Node.js 18+](https://nodejs.org/) (for building the UI)
- [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) (for deployment)
- [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) (for local blob storage emulation) or an Azure Storage account

## Local Setup

### 1. Build the UI

```bash
cd app
npm install
npm run build
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
    "STORAGE_CONNECTION_STRING": "UseDevelopmentStorage=true"
  }
}
```

| Setting | Required | Description |
|---------|----------|-------------|
| `STORAGE_CONNECTION_STRING` | Option A | Full connection string to an Azure Storage account. Use `UseDevelopmentStorage=true` for Azurite. |
| `STORAGE_ACCOUNT_NAME` | Option B | Storage account name (uses `DefaultAzureCredential` for auth). |

If neither is set, the app defaults to `UseDevelopmentStorage=true` (Azurite).

### 3. Start Azurite (for local development)

```bash
azurite --silent
```

### 4. Build and run

```bash
dotnet build
func start
```

The MCP server will be available at `http://localhost:7071`.

### 5. Connect an MCP client

Add the server to your MCP client configuration (e.g., VS Code `mcp.json`):

```json
{
  "servers": {
    "blobstorage-mcp": {
      "type": "sse",
      "url": "http://localhost:7071/runtime/webhooks/mcp/sse"
    }
  }
}
```

## Deployment to Azure

### Using Azure Developer CLI

From the `src/BlobStorage` directory:

```bash
azd auth login
azd up
```

This provisions a Flex Consumption Function App with managed identity and deploys the app.

To deploy with Easy Auth (Microsoft Entra ID), see [Optional Features](../../README.md#optional-features) in the root README.

### Configure app settings

After deployment, configure the storage account the app should connect to:

```bash
az functionapp config appsettings set \
  --name <function-app-name> \
  --resource-group <resource-group> \
  --settings "STORAGE_ACCOUNT_NAME=<storage-account-name>"
```

Using `STORAGE_ACCOUNT_NAME` with managed identity is recommended for production. The Function App's identity will need the **Storage Blob Data Contributor** role on the target storage account.

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
    "blobstorage-mcp": {
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
    "blobstorage-mcp": {
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
BlobStorage/
├── Program.cs                # Host setup, registers BlobServiceClient with DI
├── BlobStorageTools.cs        # MCP tool functions
├── BlobStorageResources.cs    # MCP resource serving the UI widget
├── BlobStorage.csproj         # Project file (Azure.Storage.Blobs, MCP extension)
├── host.json                  # Functions host configuration
├── local.settings.json        # Local app settings
└── app/                       # Vite + TypeScript UI
    ├── src/blobstorage-app.ts # Interactive UI with container/blob drill-down
    ├── index.html             # HTML template with styles
    ├── package.json            # Node dependencies
    ├── vite.config.ts          # Vite config (singlefile plugin)
    └── dist/index.html         # Built output (bundled single file)
```
