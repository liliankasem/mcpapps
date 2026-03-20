using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Mcp;
using Microsoft.Graph;
using Microsoft.Graph.Models;
using Microsoft.Graph.Users.Item.SendMail;
using ModelContextProtocol.Protocol;

internal class EmailCalendarTools
{
    private readonly GraphServiceClient _graph;

    private const string ToolMetadata = """
        {
            "ui": {
                "resourceUri": "ui://emailcalendar/index.html"
            }
        }
        """;

    public EmailCalendarTools(GraphServiceClient graph)
    {
        _graph = graph;
    }

    private static string GetTargetUser()
    {
        return Environment.GetEnvironmentVariable("TARGET_USER_EMAIL")
            ?? throw new InvalidOperationException("TARGET_USER_EMAIL environment variable is not set.");
    }

    private static CallToolResult WithStructuredContent(string text, object structuredData)
    {
        var json = JsonSerializer.Serialize(structuredData);
        return new CallToolResult
        {
            Content = [new TextContentBlock { Text = text }],
            StructuredContent = JsonNode.Parse(json)
        };
    }

    [Function("send_email")]
    public async Task<CallToolResult> SendEmail(
        [McpToolTrigger("send_email", "Send an email via Microsoft Graph")]
        [McpMetadata(ToolMetadata)] SendEmailInput input,
        ToolInvocationContext context)
    {
        var userId = GetTargetUser();

        var message = new Message
        {
            Subject = input.Subject,
            Body = new ItemBody
            {
                ContentType = BodyType.Text,
                Content = input.Body
            },
            ToRecipients =
            [
                new Recipient
                {
                    EmailAddress = new EmailAddress { Address = input.To }
                }
            ]
        };

        if (!string.IsNullOrWhiteSpace(input.Cc))
        {
            message.CcRecipients =
            [
                new Recipient
                {
                    EmailAddress = new EmailAddress { Address = input.Cc }
                }
            ];
        }

        await _graph.Users[userId].SendMail.PostAsync(new SendMailPostRequestBody
        {
            Message = message,
            SaveToSentItems = true
        });

        var result = new { to = input.To, subject = input.Subject, cc = input.Cc, status = "sent" };
        var summary = $"Email sent to {input.To}: \"{input.Subject}\"";
        return WithStructuredContent(summary, result);
    }

    [Function("search_emails")]
    public async Task<CallToolResult> SearchEmails(
        [McpToolTrigger("search_emails", "Search emails in the user's mailbox")]
        [McpMetadata(ToolMetadata)] ToolInvocationContext context,
        [McpToolProperty("query", "Search query (searches subject, body, and sender)")] string query,
        [McpToolProperty("maxResults", "Maximum number of results to return (optional, default 10)")] int? maxResults)
    {
        var userId = GetTargetUser();
        var top = maxResults ?? 10;

        var messages = await _graph.Users[userId].Messages.GetAsync(config =>
        {
            config.QueryParameters.Search = $"\"{query}\"";
            config.QueryParameters.Top = top;
            config.QueryParameters.Select = ["subject", "from", "receivedDateTime", "bodyPreview", "isRead", "webLink"];
            config.QueryParameters.Orderby = ["receivedDateTime desc"];
        });

        var items = (messages?.Value ?? []).Select(m => new
        {
            subject = m.Subject,
            from = m.From?.EmailAddress?.Address,
            receivedAt = m.ReceivedDateTime?.ToString("o"),
            preview = m.BodyPreview,
            isRead = m.IsRead,
            url = m.WebLink
        }).ToArray();

        var summary = $"Found {items.Length} emails matching \"{query}\". Results displayed in UI.";
        return WithStructuredContent(summary, new { items });
    }

    [Function("list_events")]
    public async Task<CallToolResult> ListEvents(
        [McpToolTrigger("list_events", "List calendar events within a date range")]
        [McpMetadata(ToolMetadata)] ToolInvocationContext context,
        [McpToolProperty("startDate", "Start date (ISO 8601, e.g. 2026-03-20T00:00:00)")] string startDate,
        [McpToolProperty("endDate", "End date (ISO 8601, e.g. 2026-03-27T00:00:00)")] string endDate,
        [McpToolProperty("maxResults", "Maximum number of results (optional, default 20)")] int? maxResults)
    {
        var userId = GetTargetUser();
        var top = maxResults ?? 20;

        var events = await _graph.Users[userId].CalendarView.GetAsync(config =>
        {
            config.QueryParameters.StartDateTime = startDate;
            config.QueryParameters.EndDateTime = endDate;
            config.QueryParameters.Top = top;
            config.QueryParameters.Select = ["subject", "start", "end", "location", "organizer", "isAllDay", "webLink"];
            config.QueryParameters.Orderby = ["start/dateTime"];
        });

        var items = (events?.Value ?? []).Select(e => new
        {
            subject = e.Subject,
            start = e.Start?.DateTime,
            startTimeZone = e.Start?.TimeZone,
            end = e.End?.DateTime,
            endTimeZone = e.End?.TimeZone,
            location = e.Location?.DisplayName,
            organizer = e.Organizer?.EmailAddress?.Address,
            isAllDay = e.IsAllDay,
            url = e.WebLink
        }).ToArray();

        var summary = $"Found {items.Length} events between {startDate} and {endDate}. Results displayed in UI.";
        return WithStructuredContent(summary, new { items });
    }

    [Function("create_event")]
    public async Task<CallToolResult> CreateEvent(
        [McpToolTrigger("create_event", "Create a new calendar event")]
        [McpMetadata(ToolMetadata)] CreateEventInput input,
        ToolInvocationContext context)
    {
        var userId = GetTargetUser();

        var newEvent = new Event
        {
            Subject = input.Subject,
            Start = new DateTimeTimeZone
            {
                DateTime = input.Start,
                TimeZone = "UTC"
            },
            End = new DateTimeTimeZone
            {
                DateTime = input.End,
                TimeZone = "UTC"
            }
        };

        if (!string.IsNullOrWhiteSpace(input.Body))
        {
            newEvent.Body = new ItemBody
            {
                ContentType = BodyType.Text,
                Content = input.Body
            };
        }

        if (!string.IsNullOrWhiteSpace(input.Location))
        {
            newEvent.Location = new Location
            {
                DisplayName = input.Location
            };
        }

        if (!string.IsNullOrWhiteSpace(input.Attendees))
        {
            newEvent.Attendees = input.Attendees.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(email => new Attendee
                {
                    EmailAddress = new EmailAddress { Address = email },
                    Type = AttendeeType.Required
                }).ToList();
        }

        var created = await _graph.Users[userId].Events.PostAsync(newEvent);

        var result = new
        {
            id = created?.Id,
            subject = created?.Subject,
            start = created?.Start?.DateTime,
            end = created?.End?.DateTime,
            url = created?.WebLink
        };

        var summary = $"Created event \"{input.Subject}\" from {input.Start} to {input.End}";
        return WithStructuredContent(summary, result);
    }
}
