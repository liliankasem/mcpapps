using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Mcp;

public class EmailCalendarResources
{
    private const string ResourceMetadata = """
        {
            "ui": {
                "prefersBorder": true
            }
        }
        """;

    [Function("get_emailcalendar_widget")]
    public string GetEmailCalendarWidget(
        [McpResourceTrigger(
            "ui://emailcalendar/index.html",
            "Email & Calendar Widget",
            MimeType = "text/html;profile=mcp-app",
            Description = "Interactive email and calendar viewer for MCP Apps")]
        [McpMetadata(ResourceMetadata)]
        ResourceInvocationContext context)
    {
        var file = Path.Combine(AppContext.BaseDirectory, "app", "dist", "index.html");
        return File.ReadAllText(file);
    }
}
