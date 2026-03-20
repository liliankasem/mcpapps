using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Mcp;

internal class GitHubResources
{
    private const string ResourceMetadata = """
        {
            "ui": {
                "prefersBorder": true
            }
        }
        """;

    [Function("get_github_widget")]
    public string GetGitHubWidget(
        [McpResourceTrigger(
            "ui://github/index.html",
            "GitHub Widget",
            MimeType = "text/html;profile=mcp-app",
            Description = "Interactive GitHub data viewer for MCP Apps")]
        [McpMetadata(ResourceMetadata)]
        ResourceInvocationContext context)
    {
        var file = Path.Combine(AppContext.BaseDirectory, "app", "dist", "index.html");
        return File.ReadAllText(file);
    }
}
