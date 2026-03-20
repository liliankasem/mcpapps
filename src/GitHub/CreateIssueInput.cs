using System.ComponentModel;

internal class CreateIssueInput
{
    [Description("Repository owner")]
    public required string Owner { get; set; }

    [Description("Repository name")]
    public required string Repo { get; set; }

    [Description("Issue title")]
    public required string Title { get; set; }

    [Description("Issue body")]
    public required string Body { get; set; }
}
