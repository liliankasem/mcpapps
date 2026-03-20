using System.Text.Json;
using Azure.AI.Vision.ImageAnalysis;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Mcp;

namespace AzureAIVision;

internal class VisionTools
{
    private readonly ImageAnalysisClient _client;

    public VisionTools(ImageAnalysisClient client)
    {
        _client = client;
    }

    [Function(nameof(AnalyzeImage))]
    public async Task<string> AnalyzeImage(
        [McpToolTrigger("analyze_image",
            "Analyze an image to detect objects, tags, and people. " +
            "By default all features are included; set individual flags to false to exclude them.")]
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

        var response = new Dictionary<string, object>();

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

    [Function(nameof(ReadText))]
    public async Task<string> ReadText(
        [McpToolTrigger("read_text", "Extract text from an image using OCR (optical character recognition)")]
        ReadTextInput input,
        ToolInvocationContext context)
    {
        var result = await _client.AnalyzeAsync(new Uri(input.ImageUrl), VisualFeatures.Read);

        if (result.Value.Read is not { Blocks: { } blocks } || blocks.Count == 0)
        {
            return JsonSerializer.Serialize(new { text = "", message = "No text detected in the image." });
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

        return JsonSerializer.Serialize(new { text = fullText, lines });
    }

    [Function(nameof(DescribeImage))]
    public async Task<string> DescribeImage(
        [McpToolTrigger("describe_image", "Generate a natural language description (caption) of an image")]
        DescribeImageInput input,
        ToolInvocationContext context)
    {
        var result = await _client.AnalyzeAsync(
            new Uri(input.ImageUrl),
            VisualFeatures.Tags);

        var response = new Dictionary<string, object>();

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
