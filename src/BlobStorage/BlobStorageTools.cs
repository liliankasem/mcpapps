using System.Text.Json;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Mcp;

public class BlobStorageTools
{
    private readonly BlobServiceClient _blobServiceClient;

    public BlobStorageTools(BlobServiceClient blobServiceClient)
    {
        _blobServiceClient = blobServiceClient;
    }

    private const string ToolMetadata = """
        {
            "ui": {
                "resourceUri": "ui://blobstorage/index.html"
            }
        }
        """;

    [Function("list_containers")]
    public async Task<string> ListContainers(
        [McpToolTrigger("list_containers", "List all blob containers in the storage account")]
        [McpMetadata(ToolMetadata)]
        ToolInvocationContext context)
    {
        var containers = new List<object>();

        await foreach (var container in _blobServiceClient.GetBlobContainersAsync())
        {
            containers.Add(new { name = container.Name });
        }

        return JsonSerializer.Serialize(containers);
    }

    [Function("list_blobs")]
    public async Task<string> ListBlobs(
        [McpToolTrigger("list_blobs", "List blobs in a storage container")]
        [McpMetadata(ToolMetadata)]
        ToolInvocationContext context,
        [McpToolProperty("containerName", "Name of the blob container")] string containerName,
        [McpToolProperty("prefix", "Optional prefix to filter blobs")] string? prefix)
    {
        if (string.IsNullOrWhiteSpace(containerName))
        {
            return JsonSerializer.Serialize(new { error = "containerName is required" });
        }

        var containerClient = _blobServiceClient.GetBlobContainerClient(containerName);
        var blobs = new List<object>();

        await foreach (var blob in containerClient.GetBlobsAsync(prefix: prefix))
        {
            blobs.Add(new
            {
                name = blob.Name,
                size = blob.Properties.ContentLength,
                contentType = blob.Properties.ContentType,
                lastModified = blob.Properties.LastModified
            });
        }

        return JsonSerializer.Serialize(blobs);
    }

    [Function("read_blob")]
    public async Task<string> ReadBlob(
        [McpToolTrigger("read_blob", "Read a blob's content as text")]
        [McpMetadata(ToolMetadata)]
        ToolInvocationContext context,
        [McpToolProperty("containerName", "Name of the blob container")] string containerName,
        [McpToolProperty("blobName", "Name of the blob to read")] string blobName)
    {
        if (string.IsNullOrWhiteSpace(containerName))
        {
            return JsonSerializer.Serialize(new { error = "containerName is required" });
        }

        if (string.IsNullOrWhiteSpace(blobName))
        {
            return JsonSerializer.Serialize(new { error = "blobName is required" });
        }

        var containerClient = _blobServiceClient.GetBlobContainerClient(containerName);
        var blobClient = containerClient.GetBlobClient(blobName);
        var response = await blobClient.DownloadContentAsync();
        var contentType = response.Value.Details.ContentType ?? "application/octet-stream";
        var data = response.Value.Content;

        // For text-based content types, return as string
        if (contentType.StartsWith("text/", StringComparison.OrdinalIgnoreCase)
            || contentType.Contains("json", StringComparison.OrdinalIgnoreCase)
            || contentType.Contains("xml", StringComparison.OrdinalIgnoreCase)
            || contentType.Contains("yaml", StringComparison.OrdinalIgnoreCase)
            || contentType.Contains("javascript", StringComparison.OrdinalIgnoreCase))
        {
            return data.ToString();
        }

        // For binary content, return metadata + hex preview
        var bytes = data.ToArray();
        var preview = Convert.ToHexString(bytes, 0, Math.Min(bytes.Length, 256));
        return JsonSerializer.Serialize(new
        {
            message = $"Binary blob ({contentType}), {bytes.Length} bytes",
            contentType,
            size = bytes.Length,
            hexPreview = preview
        });
    }

    [Function("write_blob")]
    public async Task<string> WriteBlob(
        [McpToolTrigger("write_blob", "Write text content to a blob")]
        [McpMetadata(ToolMetadata)]
        ToolInvocationContext context,
        [McpToolProperty("containerName", "Name of the blob container")] string containerName,
        [McpToolProperty("blobName", "Name of the blob to write")] string blobName,
        [McpToolProperty("content", "Text content to write to the blob")] string content)
    {
        if (string.IsNullOrWhiteSpace(containerName))
        {
            return JsonSerializer.Serialize(new { error = "containerName is required" });
        }

        if (string.IsNullOrWhiteSpace(blobName))
        {
            return JsonSerializer.Serialize(new { error = "blobName is required" });
        }

        var containerClient = _blobServiceClient.GetBlobContainerClient(containerName);
        await containerClient.CreateIfNotExistsAsync();
        var blobClient = containerClient.GetBlobClient(blobName);
        await blobClient.UploadAsync(BinaryData.FromString(content), overwrite: true);

        return JsonSerializer.Serialize(new { message = $"Blob '{blobName}' written to container '{containerName}'" });
    }

    [Function("delete_blob")]
    public async Task<string> DeleteBlob(
        [McpToolTrigger("delete_blob", "Delete a blob from a container")]
        [McpMetadata(ToolMetadata)]
        ToolInvocationContext context,
        [McpToolProperty("containerName", "Name of the blob container")] string containerName,
        [McpToolProperty("blobName", "Name of the blob to delete")] string blobName)
    {
        if (string.IsNullOrWhiteSpace(containerName))
        {
            return JsonSerializer.Serialize(new { error = "containerName is required" });
        }

        if (string.IsNullOrWhiteSpace(blobName))
        {
            return JsonSerializer.Serialize(new { error = "blobName is required" });
        }

        var containerClient = _blobServiceClient.GetBlobContainerClient(containerName);
        var blobClient = containerClient.GetBlobClient(blobName);
        await blobClient.DeleteIfExistsAsync();

        return JsonSerializer.Serialize(new { message = $"Blob '{blobName}' deleted from container '{containerName}'" });
    }
}
