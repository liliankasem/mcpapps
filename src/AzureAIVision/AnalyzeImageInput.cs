using System.ComponentModel;

namespace AzureAIVision;

internal class AnalyzeImageInput
{
    [Description("URL of the image to analyze (must be publicly accessible)")]
    public required string ImageUrl { get; set; }

    [Description("Whether to detect and list tags/keywords in the image")]
    public bool? IncludeTags { get; set; }

    [Description("Whether to detect objects and their bounding boxes")]
    public bool? IncludeObjects { get; set; }

    [Description("Whether to detect people and their bounding boxes")]
    public bool? IncludePeople { get; set; }
}
