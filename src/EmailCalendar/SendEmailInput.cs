using System.ComponentModel;

internal class SendEmailInput
{
    [Description("Recipient email address")]
    public required string To { get; set; }

    [Description("Email subject")]
    public required string Subject { get; set; }

    [Description("Email body (plain text)")]
    public required string Body { get; set; }

    [Description("CC recipient email address (optional)")]
    public string? Cc { get; set; }
}
