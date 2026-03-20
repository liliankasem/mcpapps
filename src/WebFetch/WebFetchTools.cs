using System.Text.RegularExpressions;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Mcp;
using ReverseMarkdown;

namespace WebFetch;

internal class WebFetchTools
{
    private readonly IHttpClientFactory _httpClientFactory;

    private const string FetchUrlMetadata = """
        {
            "ui": {
                "resourceUri": "ui://webfetch/index.html"
            }
        }
        """;

    private const string ListLinksMetadata = """
        {
            "ui": {
                "resourceUri": "ui://webfetch/index.html"
            }
        }
        """;

    public WebFetchTools(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    [Function("fetch_url")]
    public async Task<string> FetchUrl(
        [McpToolTrigger("fetch_url", "Fetch a web page and return its content as markdown")]
        [McpMetadata(FetchUrlMetadata)]
        ToolInvocationContext context,
        [McpToolProperty("url", "The URL of the web page to fetch")] string url)
    {
        var uri = new Uri(url);

        if (!string.Equals(uri.Scheme, "https", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(uri.Scheme, "http", StringComparison.OrdinalIgnoreCase))
        {
            return "Error: Only http and https URLs are supported.";
        }

        var client = _httpClientFactory.CreateClient();
        var html = await client.GetStringAsync(uri);

        var converter = new Converter(new Config
        {
            UnknownTags = Config.UnknownTagsOption.Bypass
        });

        return converter.Convert(html);
    }

    [Function("list_links")]
    public async Task<string> ListLinks(
        [McpToolTrigger("list_links", "Fetch a web page and return a list of links found on it")]
        [McpMetadata(ListLinksMetadata)]
        ToolInvocationContext context,
        [McpToolProperty("url", "The URL of the web page to fetch")] string url)
    {
        var uri = new Uri(url);

        if (!string.Equals(uri.Scheme, "https", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(uri.Scheme, "http", StringComparison.OrdinalIgnoreCase))
        {
            return "Error: Only http and https URLs are supported.";
        }

        var client = _httpClientFactory.CreateClient();
        var html = await client.GetStringAsync(uri);

        var matches = Regex.Matches(html, @"<a\s+[^>]*href\s*=\s*[""']([^""']+)[""'][^>]*>(.*?)</a>", RegexOptions.IgnoreCase | RegexOptions.Singleline);

        var links = matches
            .Select(m => $"- [{StripHtml(m.Groups[2].Value).Trim()}]({ResolveUrl(uri, m.Groups[1].Value)})")
            .ToList();

        if (links.Count == 0)
        {
            return "No links found on the page.";
        }

        return string.Join("\n", links);
    }

    private static string ResolveUrl(Uri baseUri, string href)
    {
        if (Uri.TryCreate(baseUri, href, out var resolved))
        {
            return resolved.AbsoluteUri;
        }

        return href;
    }

    private static string StripHtml(string html)
    {
        return Regex.Replace(html, @"<[^>]+>", string.Empty);
    }
}
