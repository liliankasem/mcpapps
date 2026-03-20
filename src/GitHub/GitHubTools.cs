using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Mcp;
using ModelContextProtocol.Protocol;
using Octokit;

internal class GitHubTools
{
    private readonly IGitHubClient _github;

    private const string ToolMetadata = """
        {
            "ui": {
                "resourceUri": "ui://github/index.html"
            }
        }
        """;

    public GitHubTools(IGitHubClient github)
    {
        _github = github;
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

    [Function("search_repos")]
    public async Task<CallToolResult> SearchRepos(
        [McpToolTrigger("search_repos", "Search GitHub repositories")]
        [McpMetadata(ToolMetadata)] ToolInvocationContext context,
        [McpToolProperty("query", "Search query for repositories")] string query)
    {
        var request = new SearchRepositoriesRequest(query);
        var result = await _github.Search.SearchRepo(request);

        var repos = result.Items.Select(r => new
        {
            name = r.FullName,
            description = r.Description,
            url = r.HtmlUrl,
            stars = r.StargazersCount
        }).ToArray();

        var summary = $"Found {repos.Length} repositories for \"{query}\". Results displayed in UI.";
        return WithStructuredContent(summary, new { items = repos });
    }

    [Function("get_issues")]
    public async Task<CallToolResult> GetIssues(
        [McpToolTrigger("get_issues", "Get issues for a GitHub repository")]
        [McpMetadata(ToolMetadata)] ToolInvocationContext context,
        [McpToolProperty("owner", "Repository owner")] string owner,
        [McpToolProperty("repo", "Repository name")] string repo)
    {
        var issues = await _github.Issue.GetAllForRepository(owner, repo);

        var result = issues.Where(i => i.PullRequest is null).Select(i => new
        {
            number = i.Number,
            title = i.Title,
            state = i.State.StringValue,
            author = i.User.Login
        }).ToArray();

        var summary = $"Found {result.Length} issues in {owner}/{repo}. Results displayed in UI.";
        return WithStructuredContent(summary, new { items = result });
    }

    [Function("create_issue")]
    public async Task<CallToolResult> CreateIssue(
        [McpToolTrigger("create_issue", "Create a new issue in a GitHub repository")]
        [McpMetadata(ToolMetadata)] CreateIssueInput input,
        ToolInvocationContext context)
    {
        var newIssue = new NewIssue(input.Title) { Body = input.Body };
        var issue = await _github.Issue.Create(input.Owner, input.Repo, newIssue);

        var result = new { number = issue.Number, url = issue.HtmlUrl };
        var summary = $"Created issue #{issue.Number} in {input.Owner}/{input.Repo}: {issue.HtmlUrl}";
        return WithStructuredContent(summary, result);
    }

    [Function("get_pull_requests")]
    public async Task<CallToolResult> GetPullRequests(
        [McpToolTrigger("get_pull_requests", "Get pull requests for a GitHub repository")]
        [McpMetadata(ToolMetadata)] ToolInvocationContext context,
        [McpToolProperty("owner", "Repository owner")] string owner,
        [McpToolProperty("repo", "Repository name")] string repo)
    {
        var pullRequests = await _github.PullRequest.GetAllForRepository(owner, repo);

        var result = pullRequests.Select(pr => new
        {
            number = pr.Number,
            title = pr.Title,
            state = pr.State.StringValue,
            author = pr.User.Login,
            url = pr.HtmlUrl
        }).ToArray();

        var summary = $"Found {result.Length} pull requests in {owner}/{repo}. Results displayed in UI.";
        return WithStructuredContent(summary, new { items = result });
    }

    [Function("get_file_contents")]
    public async Task<string> GetFileContents(
        [McpToolTrigger("get_file_contents", "Get file contents from a GitHub repository")]
        [McpMetadata(ToolMetadata)] ToolInvocationContext context,
        [McpToolProperty("owner", "Repository owner")] string owner,
        [McpToolProperty("repo", "Repository name")] string repo,
        [McpToolProperty("path", "File path in the repository")] string path)
    {
        var contents = await _github.Repository.Content.GetAllContents(owner, repo, path);
        var file = contents.First();

        return file.Content;
    }

    [Function("get_issue_detail")]
    public async Task<CallToolResult> GetIssueDetail(
        [McpToolTrigger("get_issue_detail", "Get detailed information about a specific issue")]
        [McpMetadata(ToolMetadata)]
        ToolInvocationContext context,
        [McpToolProperty("owner", "Repository owner")] string owner,
        [McpToolProperty("repo", "Repository name")] string repo,
        [McpToolProperty("number", "Issue number")] int number)
    {
        var issue = await _github.Issue.Get(owner, repo, number);

        var result = new
        {
            number = issue.Number,
            title = issue.Title,
            state = issue.State.StringValue,
            author = issue.User.Login,
            body = issue.Body,
            labels = issue.Labels.Select(l => new { name = l.Name, color = l.Color }).ToArray(),
            assignees = issue.Assignees.Select(a => a.Login).ToArray(),
            createdAt = issue.CreatedAt.ToString("o"),
            updatedAt = issue.UpdatedAt?.ToString("o"),
            comments = issue.Comments,
            url = issue.HtmlUrl
        };

        var summary = $"Issue #{issue.Number} ({issue.State.StringValue}): {issue.Title}";
        return WithStructuredContent(summary, result);
    }

    [Function("get_pr_detail")]
    public async Task<CallToolResult> GetPrDetail(
        [McpToolTrigger("get_pr_detail", "Get detailed information about a specific pull request")]
        [McpMetadata(ToolMetadata)]
        ToolInvocationContext context,
        [McpToolProperty("owner", "Repository owner")] string owner,
        [McpToolProperty("repo", "Repository name")] string repo,
        [McpToolProperty("number", "Pull request number")] int number)
    {
        var pr = await _github.PullRequest.Get(owner, repo, number);

        var result = new
        {
            number = pr.Number,
            title = pr.Title,
            state = pr.State.StringValue,
            author = pr.User.Login,
            body = pr.Body,
            labels = pr.Labels.Select(l => new { name = l.Name, color = l.Color }).ToArray(),
            head = pr.Head.Ref,
            @base = pr.Base.Ref,
            mergeable = pr.Mergeable,
            additions = pr.Additions,
            deletions = pr.Deletions,
            changedFiles = pr.ChangedFiles,
            createdAt = pr.CreatedAt.ToString("o"),
            updatedAt = pr.UpdatedAt.ToString("o"),
            mergedAt = pr.MergedAt?.ToString("o"),
            url = pr.HtmlUrl
        };

        var summary = $"PR #{pr.Number} ({pr.State.StringValue}): {pr.Title} ({pr.Head.Ref} → {pr.Base.Ref})";
        return WithStructuredContent(summary, result);
    }

    [Function("get_repo_detail")]
    public async Task<CallToolResult> GetRepoDetail(
        [McpToolTrigger("get_repo_detail", "Get detailed information about a repository")]
        [McpMetadata(ToolMetadata)]
        ToolInvocationContext context,
        [McpToolProperty("owner", "Repository owner")] string owner,
        [McpToolProperty("repo", "Repository name")] string repo)
    {
        var repository = await _github.Repository.Get(owner, repo);

        var result = new
        {
            fullName = repository.FullName,
            description = repository.Description,
            language = repository.Language,
            stars = repository.StargazersCount,
            forks = repository.ForksCount,
            openIssues = repository.OpenIssuesCount,
            watchers = repository.SubscribersCount,
            defaultBranch = repository.DefaultBranch,
            license = repository.License?.Name,
            createdAt = repository.CreatedAt.ToString("o"),
            updatedAt = repository.UpdatedAt.ToString("o"),
            topics = repository.Topics,
            url = repository.HtmlUrl
        };

        var summary = $"{repository.FullName}: {repository.Description} (⭐ {repository.StargazersCount}, 🍴 {repository.ForksCount})";
        return WithStructuredContent(summary, result);
    }
}
