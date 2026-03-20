using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Mcp;

namespace WebFetch;

public class WebFetchResources
{
    private const string ResourceMetadata = """
        {
            "ui": {
                "prefersBorder": true
            }
        }
        """;

    [Function("get_webfetch_widget")]
    public string GetWebFetchWidget(
        [McpResourceTrigger(
            "ui://webfetch/index.html",
            "WebFetch Widget",
            MimeType = "text/html;profile=mcp-app",
            Description = "Interactive web content viewer for MCP Apps")]
        [McpMetadata(ResourceMetadata)]
        ResourceInvocationContext context)
    {
        var file = Path.Combine(AppContext.BaseDirectory, "app", "dist", "index.html");
        return File.ReadAllText(file);
    }
}
