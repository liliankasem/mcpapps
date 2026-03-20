using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Mcp;

namespace AzureAIVision;

internal class VisionResources
{
    private const string ResourceMetadata = """
        {
            "ui": {
                "prefersBorder": true
            }
        }
        """;

    [Function("get_vision_widget")]
    public string GetVisionWidget(
        [McpResourceTrigger(
            "ui://azureaivision/index.html",
            "AI Vision Widget",
            MimeType = "text/html;profile=mcp-app",
            Description = "Interactive image analysis viewer with bounding box overlays for MCP Apps")]
        [McpMetadata(ResourceMetadata)]
        ResourceInvocationContext context)
    {
        var file = Path.Combine(AppContext.BaseDirectory, "app", "dist", "index.html");
        return File.ReadAllText(file);
    }
}
