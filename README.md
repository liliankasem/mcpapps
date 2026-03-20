# MCP Apps

A collection of MCP (Model Context Protocol) server applications built with Azure Functions (.NET 10) and the Azure Functions MCP extension.

## Repository Structure

```
mcpapps/
├── McpApps.slnx                 # Solution file
├── Directory.Build.props        # Shared build properties (.NET 10)
├── .editorconfig                # Code style settings
├── infra/                       # Shared Azure infrastructure
│   ├── abbreviations.json       # Azure resource naming abbreviations
│   ├── bicepconfig.json         # Bicep configuration (includes Microsoft Graph extension)
│   └── shared/                  # Reusable Bicep modules
│       ├── entra-app.bicep            # Entra ID app registration (for EasyAuth)
│       ├── function-app.bicep         # Flex Consumption Function App
│       ├── rbac.bicep                 # RBAC role assignments
│       ├── vnet.bicep                 # Virtual network
│       └── storage-private-endpoint.bicep  # Storage private endpoints
└── src/                         # MCP app projects (added per-app)
```

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
- [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd)

## Getting Started

1. Clone the repository
2. Build all projects: `dotnet build`
3. To run a specific app locally, navigate to its project directory and use `func start`

## Deployment

Each MCP app can be deployed independently using Azure Developer CLI:

```bash
cd src/<app-name>
azd up
```

## Shared Infrastructure

The `infra/shared/` directory contains reusable Bicep modules for provisioning Azure resources. Each app composes these modules in its own `infra/main.bicep` to deploy:

- **Flex Consumption Function App** with managed identity
- **Storage Account** with RBAC-based access (no shared keys)
- **Application Insights** with AAD authentication
- **Virtual Network** with private endpoints (optional)
- **Easy Auth** with Microsoft Entra ID app registration (optional)

### Optional Features

| Feature | Environment Variable | Default | Description |
|---------|---------------------|---------|-------------|
| Virtual Network | `VNET_ENABLED` | `false` | Deploy with VNet integration and private endpoints |
| Easy Auth | `EASY_AUTH_ENABLED` | `false` | Enable Microsoft Entra ID authentication with auto-provisioned app registration |
| Pre-authorized Clients | `PRE_AUTHORIZED_CLIENT_IDS` | _(empty)_ | Comma-separated client IDs to pre-authorize for the MCP API |
| Service Management Ref | `SERVICE_MANAGEMENT_REFERENCE` | _(auto-generated)_ | Service management reference GUID for the app registration. Required by some tenants — see [notes](#service-management-reference) |

To enable optional features, set the environment variable before running `azd up`:

```bash
azd env set VNET_ENABLED true
azd up
```

#### Easy Auth Setup

When Easy Auth is enabled, the deployment **automatically** creates a fully configured Entra ID app registration with:

- OAuth2 `user_impersonation` scope
- Federated identity credential linking the managed identity to the app registration
- App Service Authentication (authsettingsV2) with token store, JWT validation, and nonce checks
- Redirect URI for the `/.auth/login/aad/callback` endpoint

> **Note:** When Easy Auth is enabled, each app's `host.json` sets `webhookAuthorizationLevel` to `Anonymous` so that EasyAuth handles authentication instead of requiring a function key. All apps in this repo are pre-configured with this setting.

To deploy with Easy Auth:

```bash
azd env set EASY_AUTH_ENABLED true
azd up
```

Optionally, pre-authorize specific client applications to avoid admin consent prompts. This is **recommended** for corporate tenants that restrict user consent:

```bash
azd env set EASY_AUTH_ENABLED true
# Pre-authorize VS Code and Azure CLI
azd env set PRE_AUTHORIZED_CLIENT_IDS "04b07795-8ddb-461a-bbee-02f9e1bf7b46,aebc6443-996d-45c2-90f0-388ff96faa56"
azd up
```

| Client | Client ID |
|--------|-----------|
| Azure CLI | `04b07795-8ddb-461a-bbee-02f9e1bf7b46` |
| Visual Studio Code | `aebc6443-996d-45c2-90f0-388ff96faa56` |

After deployment, the following outputs are available:

| Output | Description |
|--------|-------------|
| `ENTRA_APPLICATION_ID` | The auto-created app registration's client ID |
| `ENTRA_IDENTIFIER_URI` | The application identifier URI |
| `AUTH_REDIRECT_URI` | The configured authentication redirect URI |
| `AUTH_ENABLED` | Whether authentication is active |
| `CONFIGURED_SCOPES` | The OAuth2 scopes exposed by the app |

To disable Easy Auth on an existing deployment:

```bash
azd env set EASY_AUTH_ENABLED false
azd up
```

#### Service Management Reference

Some Entra ID tenants enforce a policy requiring a valid `serviceManagementReference` GUID on all app registrations. This GUID must reference an actual service registered in your organization's service catalog (e.g., [Service Tree](https://servicetree.msftcloudes.com)).

- **Most tenants**: No action needed — a deterministic GUID is auto-generated and accepted by non-enforcing tenants.
- **Tenants with enforced policy** (e.g., Microsoft corp): If deployment fails with `"ServiceManagementReference field is required"` or `"Service not found for id"`, provide a valid GUID from your org's service catalog:

```bash
azd env set SERVICE_MANAGEMENT_REFERENCE "<your-service-tree-guid>"
azd up
```
