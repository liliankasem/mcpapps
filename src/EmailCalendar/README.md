# Email & Calendar MCP App

Azure Functions MCP server for email and calendar operations via Microsoft Graph.

## Tools

| Tool | Description |
|------|-------------|
| `send_email` | Send an email (to, subject, body, optional cc) |
| `search_emails` | Search emails by query (subject, body, sender) |
| `list_events` | List calendar events within a date range |
| `create_event` | Create a new calendar event with optional attendees and location |

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
- [Node.js 18+](https://nodejs.org/) (for building the UI)
- [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) (for deployment)
- [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) (for local storage emulation)

## Getting Started

This app needs an Entra ID app registration with Microsoft Graph permissions. The recommended approach is to deploy the infrastructure first — this creates the app registration for you — then add Graph permissions to it.

### 1. Deploy Infrastructure

Deploy with Easy Auth enabled to have Bicep create the app registration automatically:

```bash
azd auth login
azd env set EASY_AUTH_ENABLED true
azd up
```

See [Optional Features](../../README.md#optional-features) in the root README for additional options (VNet, pre-authorized clients, etc.).

To redeploy just the app code (without re-provisioning infrastructure):

```bash
azd deploy
```

> **Alternatively**, if you want to run locally without deploying, [create an app registration manually](#manual-app-registration) and skip to [Configure Environment Variables](#4-configure-environment-variables).

### 2. Add Graph API Permissions

Find your app registration in the [Azure Portal](https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/RegisteredApps) (or look up the client ID with `azd env get-value ENTRA_APPLICATION_ID`).

In your app registration → **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions**:

| Permission | Purpose |
|---|---|
| `Mail.Read` | Search emails |
| `Mail.Send` | Send emails |
| `Calendars.Read` | List calendar events |
| `Calendars.ReadWrite` | Create calendar events |

Click **Grant admin consent** for your tenant.

### 3. Create Client Secret

In your app registration → **Certificates & secrets** → **New client secret**:
- Add a description and expiration
- Copy the **Value** (not the Secret ID)

### 4. Configure Environment Variables

Set the Graph API app settings on the deployed function app:

```bash
az functionapp config appsettings set \
  --name <function-app-name> \
  --resource-group <resource-group> \
  --settings \
    "AZURE_TENANT_ID=<your-tenant-id>" \
    "AZURE_CLIENT_ID=<your-app-client-id>" \
    "AZURE_CLIENT_SECRET=<your-client-secret-value>" \
    "TARGET_USER_EMAIL=user@yourdomain.com"
```

| Variable | Description |
|---|---|
| `AZURE_TENANT_ID` | Your Entra ID tenant ID |
| `AZURE_CLIENT_ID` | The app registration's Application (client) ID |
| `AZURE_CLIENT_SECRET` | The client secret value from step 3 |
| `TARGET_USER_EMAIL` | The mailbox to operate on (the user whose email/calendar is accessed) |

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
    "emailcalendar-mcp": {
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
    "emailcalendar-mcp": {
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

## Running Locally

You can also use the same app registration for local development. Copy the sample settings file and add your secrets:

```bash
cp local.settings.sample.json local.settings.json
```

Then edit `local.settings.json` to add your Graph API credentials:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "dotnet-isolated",
    "AZURE_TENANT_ID": "<your-tenant-id>",
    "AZURE_CLIENT_ID": "<your-app-client-id>",
    "AZURE_CLIENT_SECRET": "<your-client-secret-value>",
    "TARGET_USER_EMAIL": "user@yourdomain.com"
  }
}
```


```bash
# Start Azurite for local storage emulation
azurite --silent &

# Build the UI widget (produces app/dist/index.html, bundled into function output at build time)
cd app && npm install && npm run build && cd ..

# Start the function app
func start
```

The MCP server will be available at `http://localhost:7071/runtime/webhooks/mcp`.

## Manual App Registration

If you prefer to run locally without deploying infrastructure first:

1. Go to [Azure Portal → Entra ID → App registrations](https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/RegisteredApps)
2. Click **New registration**
3. Name: `MCP Email Calendar App` (or your preference)
4. Supported account types: **Single tenant**
5. Click **Register**

Then continue from [Add Graph API Permissions](#2-add-graph-api-permissions) above.

## Architecture

- **Azure Functions v4** (.NET isolated worker)
- **Microsoft.Graph SDK** for all Microsoft 365 operations
- **Client credentials flow** (app-only permissions) via `Azure.Identity`
- **MCP extension** (`Microsoft.Azure.Functions.Worker.Extensions.Mcp`) for tool/resource bindings
- **UI widget** built with Vite + TypeScript, bundled as single HTML file via `vite-plugin-singlefile`
