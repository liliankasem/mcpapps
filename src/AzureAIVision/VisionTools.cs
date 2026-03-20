using System.Text.Json;
using Azure.AI.Vision.ImageAnalysis;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Mcp;

namespace AzureAIVision;

internal class VisionTools
{
    private readonly ImageAnalysisClient _client;
    private static readonly HttpClient _httpClient = new();

    public VisionTools(ImageAnalysisClient client)
    {
        _client = client;
    }

    private const string ToolMetadata = """
        {
            "ui": {
                "resourceUri": "ui://azureaivision/index.html"
            }
        }
        """;

    private static async Task<string?> FetchImageAsDataUri(string imageUrl)
    {
        try
        {
            var response = await _httpClient.GetAsync(imageUrl);
            response.EnsureSuccessStatusCode();
            var contentType = response.Content.Headers.ContentType?.MediaType ?? "image/jpeg";
            var bytes = await response.Content.ReadAsByteArrayAsync();
            return $"data:{contentType};base64,{Convert.ToBase64String(bytes)}";
        }
        catch
        {
            return null;
        }
    }

    [Function("analyze_image")]
    public async Task<string> AnalyzeImage(
        [McpToolTrigger("analyze_image",
            "Analyze an image to detect objects, tags, and people. " +
            "By default all features are included; set individual flags to false to exclude them.")]
        [McpMetadata(ToolMetadata)]
        AnalyzeImageInput input,
        ToolInvocationContext context)
    {
        var includeTags = input.IncludeTags ?? true;
        var includeObjects = input.IncludeObjects ?? true;
        var includePeople = input.IncludePeople ?? true;

        var features = VisualFeatures.None;
        if (includeTags) features |= VisualFeatures.Tags;
        if (includeObjects) features |= VisualFeatures.Objects;
        if (includePeople) features |= VisualFeatures.People;

        if (features == VisualFeatures.None)
        {
            features = VisualFeatures.Tags;
        }

        var result = await _client.AnalyzeAsync(new Uri(input.ImageUrl), features);
        var imageDataUri = await FetchImageAsDataUri(input.ImageUrl);

        var response = new Dictionary<string, object>
        {
            ["imageUrl"] = input.ImageUrl
        };

        if (imageDataUri is not null)
            response["imageData"] = imageDataUri;

        if (includeTags && result.Value.Tags is { Values: { } tags })
        {
            response["tags"] = tags.Select(t => new
            {
                name = t.Name,
                confidence = t.Confidence
            }).ToList();
        }

        if (includeObjects && result.Value.Objects is { Values: { } objects })
        {
            response["objects"] = objects.Select(o => new
            {
                name = o.Tags.FirstOrDefault()?.Name,
                confidence = o.Tags.FirstOrDefault()?.Confidence,
                boundingBox = new
                {
                    x = o.BoundingBox.X,
                    y = o.BoundingBox.Y,
                    width = o.BoundingBox.Width,
                    height = o.BoundingBox.Height
                }
            }).ToList();
        }

        if (includePeople && result.Value.People is { Values: { } people })
        {
            response["people"] = people.Select(p => new
            {
                confidence = p.Confidence,
                boundingBox = new
                {
                    x = p.BoundingBox.X,
                    y = p.BoundingBox.Y,
                    width = p.BoundingBox.Width,
                    height = p.BoundingBox.Height
                }
            }).ToList();
        }

        return JsonSerializer.Serialize(response);
    }

    [Function("read_text")]
    public async Task<string> ReadText(
        [McpToolTrigger("read_text", "Extract text from an image using OCR (optical character recognition)")]
        [McpMetadata(ToolMetadata)]
        ReadTextInput input,
        ToolInvocationContext context)
    {
        var result = await _client.AnalyzeAsync(new Uri(input.ImageUrl), VisualFeatures.Read);

        if (result.Value.Read is not { Blocks: { } blocks } || blocks.Count == 0)
        {
            var imageDataUriEmpty = await FetchImageAsDataUri(input.ImageUrl);
            return JsonSerializer.Serialize(new { imageUrl = input.ImageUrl, imageData = imageDataUriEmpty, text = "", message = "No text detected in the image." });
        }

        var lines = blocks
            .SelectMany(b => b.Lines)
            .Select(l => new
            {
                text = l.Text,
                boundingPolygon = l.BoundingPolygon.Select(p => new { x = p.X, y = p.Y }).ToList()
            })
            .ToList();

        var fullText = string.Join("\n", blocks.SelectMany(b => b.Lines).Select(l => l.Text));
        var imageDataUri2 = await FetchImageAsDataUri(input.ImageUrl);

        return JsonSerializer.Serialize(new { imageUrl = input.ImageUrl, imageData = imageDataUri2, text = fullText, lines });
    }

    [Function("describe_image")]
    public async Task<string> DescribeImage(
        [McpToolTrigger("describe_image", "Generate a natural language description (caption) of an image")]
        [McpMetadata(ToolMetadata)]
        DescribeImageInput input,
        ToolInvocationContext context)
    {
        var result = await _client.AnalyzeAsync(
            new Uri(input.ImageUrl),
            VisualFeatures.Tags);

        var response = new Dictionary<string, object>
        {
            ["imageUrl"] = input.ImageUrl
        };

        var imageDataUri3 = await FetchImageAsDataUri(input.ImageUrl);
        if (imageDataUri3 is not null)
            response["imageData"] = imageDataUri3;

        if (result.Value.Tags is { Values: { } tags })
        {
            response["description"] = string.Join(", ", tags.Select(t => t.Name));
            response["tags"] = tags.Select(t => new
            {
                name = t.Name,
                confidence = t.Confidence
            }).ToList();
        }

        return JsonSerializer.Serialize(response);
    }
}
