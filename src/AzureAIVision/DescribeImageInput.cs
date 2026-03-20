using System.ComponentModel;

namespace AzureAIVision;

internal class DescribeImageInput
{
    [Description("URL of the image to describe (must be publicly accessible)")]
    public required string ImageUrl { get; set; }
}
