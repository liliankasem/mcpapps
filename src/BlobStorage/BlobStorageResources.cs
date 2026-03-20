using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Mcp;

public class BlobStorageResources
{
    private const string ResourceMetadata = """
        {
            "ui": {
                "prefersBorder": true
            }
        }
        """;

    [Function("get_blob_storage_widget")]
    public string GetBlobStorageWidget(
        [McpResourceTrigger(
            "ui://blobstorage/index.html",
            "Blob Storage Widget",
            MimeType = "text/html;profile=mcp-app",
            Description = "Interactive Azure Blob Storage viewer for MCP Apps")]
        [McpMetadata(ResourceMetadata)]
        ResourceInvocationContext context)
    {
        var file = Path.Combine(AppContext.BaseDirectory, "app", "dist", "index.html");
        return File.ReadAllText(file);
    }
}
