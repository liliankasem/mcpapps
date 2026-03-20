using System.ComponentModel;

internal class CreateEventInput
{
    [Description("Event subject/title")]
    public required string Subject { get; set; }

    [Description("Start date/time (ISO 8601, e.g. 2026-03-20T09:00:00)")]
    public required string Start { get; set; }

    [Description("End date/time (ISO 8601, e.g. 2026-03-20T10:00:00)")]
    public required string End { get; set; }

    [Description("Event description (optional)")]
    public string? Body { get; set; }

    [Description("Comma-separated attendee email addresses (optional)")]
    public string? Attendees { get; set; }

    [Description("Event location (optional)")]
    public string? Location { get; set; }
}
