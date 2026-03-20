using System.ComponentModel;

namespace AzureAIVision;

internal class ReadTextInput
{
    [Description("URL of the image to extract text from (must be publicly accessible)")]
    public required string ImageUrl { get; set; }
}
