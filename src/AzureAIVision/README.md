# Azure AI Vision MCP App

An MCP server built with Azure Functions (.NET 10) that wraps [Azure AI Vision](https://learn.microsoft.com/azure/ai-services/computer-vision/) to analyze images, extract text with OCR, and generate natural language descriptions.

## Tools

| Tool | Description |
|------|-------------|
| `analyze_image` | Analyze an image to detect objects, tags, and people |
| `read_text` | Extract text from an image using OCR (optical character recognition) |
| `describe_image` | Generate a tag-based description of an image |

## UI Widget

The app includes an interactive **Image Analysis Viewer** widget that:
- Displays the analyzed image with **bounding box overlays** for detected objects and people
- Shows **tags** with confidence bars
- Highlights **OCR text regions** on the image
- Renders **descriptions** alongside the source image

The widget is served as an MCP resource and automatically appears in MCP clients that support app UIs.

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
- [Node.js 18+](https://nodejs.org/) (for building the UI widget)
- [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) (for deployment)
- [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) (for local storage emulation)
- An [Azure AI Vision](https://learn.microsoft.com/azure/ai-services/computer-vision/overview) resource

## Local Setup

### 1. Create an Azure AI Vision resource

Create a Computer Vision resource in the [Azure portal](https://portal.azure.com/#create/Microsoft.CognitiveServicesComputerVision) or via CLI:

```bash
az login
az group create --name <your-resource-group> --location eastus2
az cognitiveservices account create \
  --name <your-resource-name> \
  --resource-group <your-resource-group> \
  --kind ComputerVision \
  --sku F0 \
  --location <location> \
  --yes
```

### 2. Configure local settings

Copy the sample settings file and add your Vision resource details:

```bash
cp local.settings.sample.json local.settings.json
```

Set `VISION_ENDPOINT` to your resource's regional endpoint (e.g., `https://eastus2.api.cognitive.microsoft.com/`). You can find this in the Azure portal under your Computer Vision resource → **Keys and Endpoint**.

For authentication, either:

- Set `VISION_KEY` to your resource key (simplest for local dev), **or**
- Remove `VISION_KEY` to use `DefaultAzureCredential` (requires `az login` and the **Cognitive Services User** role on the resource)

```bash
# Get the endpoint
az cognitiveservices account show \
  --name <your-resource-name> \
  --resource-group <your-resource-group> \
  --query properties.endpoint -o tsv

# Get the key
az cognitiveservices account keys list \
  --name <your-resource-name> \
  --resource-group <your-resource-group> \
  --query key1 -o tsv
```

### 3. Start Azurite (for local storage emulation)

```bash
azurite --silent
```

### 4. Build and run

```bash
# Build the UI widget (produces app/dist/index.html, bundled into function output at build time)
cd app && npm install && npm run build && cd ..

# Start the function app
func start
```

The MCP server will be available at `http://localhost:7071`.

### 5. Connect an MCP client

Add the server to your MCP client configuration (e.g., VS Code `mcp.json`):

```json
{
  "servers": {
    "azure-ai-vision-mcp": {
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

After deployment, set the Vision resource configuration as app settings:

```bash
az functionapp config appsettings set \
  --name <function-app-name> \
  --resource-group <resource-group> \
  --settings \
    VISION_ENDPOINT="https://<region>.api.cognitive.microsoft.com/" \
    VISION_KEY="<your-vision-key>"
```

> **Tip:** Instead of using a key, you can assign the **Cognitive Services User** role to the function app's managed identity and omit `VISION_KEY`.

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
    "azure-ai-vision-mcp": {
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
    "azure-ai-vision-mcp": {
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
AzureAIVision/
├── Program.cs                # Host setup with DI for ImageAnalysisClient
├── VisionTools.cs            # MCP tool functions (analyze, OCR, describe)
├── VisionResources.cs        # MCP resource serving the UI widget
├── AnalyzeImageInput.cs      # POCO for analyze_image tool
├── ReadTextInput.cs          # POCO for read_text tool
├── DescribeImageInput.cs     # POCO for describe_image tool
├── AzureAIVision.csproj      # Project file with MCP + Vision SDK references
├── host.json                 # Functions host configuration
├── local.settings.sample.json # Sample local settings (copy to local.settings.json)
└── app/                      # Vite + TypeScript UI
    ├── src/vision-app.ts     # Image analysis viewer with bounding box overlays
    ├── index.html            # HTML template with styles
    ├── package.json          # Node dependencies
    ├── vite.config.ts        # Vite config (singlefile plugin)
    └── dist/index.html       # Built output (bundled single file)
```

## Files

| File | Purpose |
|------|---------|
| `AzureAIVision.csproj` | Project file with MCP extension + Azure AI Vision SDK references |
| `Program.cs` | Host startup with `ImageAnalysisClient` DI registration |
| `VisionTools.cs` | MCP tool implementations using `ImageAnalysisClient` |
| `VisionResources.cs` | MCP resource serving the UI widget |
| `host.json` | Functions host config with MCP extension section |
| `local.settings.sample.json` | Sample local settings (copy to `local.settings.json`) |
| `azure.yaml` | Azure Developer CLI deployment config |
