import { App } from "@modelcontextprotocol/ext-apps";

const el = (id: string) => document.getElementById(id)!;

// --- Types ---

interface Repo {
  name: string;
  description: string | null;
  url: string;
  stars: number;
}

interface RepoDetail {
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  defaultBranch: string;
  license: string | null;
  createdAt: string;
  updatedAt: string;
  topics: string[];
  url: string;
}

interface Issue {
  number: number;
  title: string;
  state: string;
  author: string;
}

interface IssueDetail {
  number: number;
  title: string;
  state: string;
  author: string;
  body: string | null;
  labels: { name: string; color: string }[];
  assignees: string[];
  createdAt: string;
  updatedAt: string | null;
  comments: number;
  url: string;
}

interface PullRequest {
  number: number;
  title: string;
  state: string;
  author: string;
  url: string;
}

interface PRDetail {
  number: number;
  title: string;
  state: string;
  author: string;
  body: string | null;
  labels: { name: string; color: string }[];
  head: string;
  base: string;
  mergeable: boolean | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  url: string;
}

interface CreatedIssue {
  number: number;
  url: string;
}

type GitHubResult = Repo[] | Issue[] | PullRequest[] | CreatedIssue | string;

// --- State ---

let currentOwner = "";
let currentRepo = "";
let navigationStack: Array<() => void> = [];
let lastRenderedData: GitHubResult | null = null;

// --- Helpers ---

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function showBackButton(onBack: () => void): void {
  const header = el("header-area");
  let backBtn = document.getElementById("back-btn");
  if (!backBtn) {
    backBtn = document.createElement("button");
    backBtn.id = "back-btn";
    backBtn.className = "back-btn";
    backBtn.textContent = "\u2190 Back";
    header.insertBefore(backBtn, header.firstChild);
  }
  backBtn.style.display = "inline-block";
  backBtn.onclick = () => {
    onBack();
    if (navigationStack.length === 0) {
      backBtn!.style.display = "none";
    }
  };
}

function hideBackButton(): void {
  const backBtn = document.getElementById("back-btn");
  if (backBtn) backBtn.style.display = "none";
}

// --- Type Guards ---

function isRepoArray(data: unknown): data is Repo[] {
  return Array.isArray(data) && data.length > 0 && "stars" in data[0];
}

function isPRArray(data: unknown): data is PullRequest[] {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    "url" in data[0] &&
    "number" in data[0] &&
    !("stars" in data[0])
  );
}

function isIssueArray(data: unknown): data is Issue[] {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    "number" in data[0] &&
    "state" in data[0] &&
    !("url" in data[0])
  );
}

function isCreatedIssue(data: unknown): data is CreatedIssue {
  return (
    typeof data === "object" &&
    data !== null &&
    "url" in data &&
    "number" in data &&
    !Array.isArray(data) &&
    !("title" in data)
  );
}

// --- Render Functions ---

function renderRepos(repos: Repo[]): void {
  el("subtitle").textContent = `${repos.length} repositories found`;
  const area = el("content-area");
  area.innerHTML = "";
  for (const repo of repos) {
    const card = document.createElement("div");
    card.className = "result-card clickable";
    card.innerHTML = `
      <p class="result-title">${escapeHtml(repo.name)}</p>
      <p class="result-desc">${escapeHtml(repo.description || "No description")}</p>
      <p class="result-meta">\u2B50 ${repo.stars}</p>
    `;
    card.addEventListener("click", () => {
      const [owner, name] = repo.name.split("/");
      if (owner && name) {
        loadRepoDetail(owner, name);
      }
    });
    area.appendChild(card);
  }
}

async function loadRepoDetail(owner: string, name: string): Promise<void> {
  const restoreFn = saveCurrentView();
  navigationStack.push(restoreFn);
  showBackButton(() => {
    const fn = navigationStack.pop();
    if (fn) fn();
  });

  el("subtitle").textContent = `${owner}/${name}`;
  el("content-area").innerHTML = '<p class="loading">Loading repository details...</p>';

  try {
    const result = await app.callServerTool({
      name: "get_repo_detail",
      arguments: { owner, repo: name },
    });
    const detail = parseStructuredOrText<RepoDetail>(result);
    if (detail) {
      renderRepoDetail(detail);
    }
  } catch (e) {
    el("content-area").innerHTML = `<p class="loading">Error loading details: ${e}</p>`;
  }
}

function renderRepoDetail(repo: RepoDetail): void {
  el("subtitle").textContent = repo.fullName;
  const area = el("content-area");
  area.innerHTML = `
    <div class="detail-view">
      <h2 class="detail-title">${escapeHtml(repo.fullName)}</h2>
      <p class="detail-desc">${escapeHtml(repo.description || "No description")}</p>
      ${
        repo.topics && repo.topics.length > 0
          ? `<div class="tag-list">${repo.topics.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>`
          : ""
      }
      <div class="detail-grid">
        <div class="detail-stat"><span class="stat-value">\u2B50 ${repo.stars}</span><span class="stat-label">Stars</span></div>
        <div class="detail-stat"><span class="stat-value">\uD83C\uDF74 ${repo.forks}</span><span class="stat-label">Forks</span></div>
        <div class="detail-stat"><span class="stat-value">\uD83D\uDC1B ${repo.openIssues}</span><span class="stat-label">Open Issues</span></div>
        <div class="detail-stat"><span class="stat-value">\uD83D\uDC41 ${repo.watchers}</span><span class="stat-label">Watchers</span></div>
      </div>
      <div class="detail-meta">
        ${repo.language ? `<p>\uD83D\uDCDD Language: <strong>${escapeHtml(repo.language)}</strong></p>` : ""}
        ${repo.license ? `<p>\uD83D\uDCDC License: <strong>${escapeHtml(repo.license)}</strong></p>` : ""}
        <p>\uD83C\uDF3F Default branch: <strong>${escapeHtml(repo.defaultBranch)}</strong></p>
        <p>\uD83D\uDCC5 Created: ${formatDate(repo.createdAt)}</p>
        <p>\uD83D\uDD04 Updated: ${formatDate(repo.updatedAt)}</p>
      </div>
    </div>
  `;
}

function renderIssues(issues: Issue[]): void {
  el("subtitle").textContent = `${issues.length} issues`;
  const area = el("content-area");
  area.innerHTML = "";
  for (const issue of issues) {
    const stateClass = issue.state === "open" ? "state-open" : "state-closed";
    const card = document.createElement("div");
    card.className = "result-card clickable";
    card.innerHTML = `
      <p class="result-title">#${issue.number} ${escapeHtml(issue.title)}</p>
      <p class="result-meta"><span class="state-badge ${stateClass}">${issue.state}</span> by ${escapeHtml(issue.author)}</p>
    `;
    card.addEventListener("click", () => {
      loadIssueDetail(currentOwner, currentRepo, issue.number);
    });
    area.appendChild(card);
  }
}

async function loadIssueDetail(
  owner: string,
  repo: string,
  number: number
): Promise<void> {
  const restoreFn = saveCurrentView();
  navigationStack.push(restoreFn);
  showBackButton(() => {
    const fn = navigationStack.pop();
    if (fn) fn();
  });

  el("subtitle").textContent = `Issue #${number}`;
  el("content-area").innerHTML = '<p class="loading">Loading issue details...</p>';

  try {
    const result = await app.callServerTool({
      name: "get_issue_detail",
      arguments: { owner, repo, number: number.toString() },
    });
    const detail = parseStructuredOrText<IssueDetail>(result);
    if (detail) {
      renderIssueDetail(detail);
    }
  } catch (e) {
    el("content-area").innerHTML = `<p class="loading">Error loading details: ${e}</p>`;
  }
}

function renderIssueDetail(issue: IssueDetail): void {
  el("subtitle").textContent = `#${issue.number} ${issue.title}`;
  const stateClass = issue.state === "open" ? "state-open" : "state-closed";
  const area = el("content-area");
  area.innerHTML = `
    <div class="detail-view">
      <div class="detail-header-row">
        <span class="state-badge ${stateClass}">${issue.state}</span>
        <span class="detail-author">opened by ${escapeHtml(issue.author)}</span>
      </div>
      <h2 class="detail-title">#${issue.number} ${escapeHtml(issue.title)}</h2>
      ${
        issue.labels.length > 0
          ? `<div class="tag-list">${issue.labels
              .map(
                (l) =>
                  `<span class="tag" style="background:#${l.color}22;color:#${l.color};border:1px solid #${l.color}44">${escapeHtml(l.name)}</span>`
              )
              .join("")}</div>`
          : ""
      }
      ${
        issue.assignees.length > 0
          ? `<p class="detail-field"><strong>Assignees:</strong> ${issue.assignees.map((a) => escapeHtml(a)).join(", ")}</p>`
          : ""
      }
      <div class="detail-body">${issue.body ? escapeHtml(issue.body) : "<em>No description provided.</em>"}</div>
      <div class="detail-meta">
        <p>\uD83D\uDCAC ${issue.comments} comment${issue.comments !== 1 ? "s" : ""}</p>
        <p>\uD83D\uDCC5 Created: ${formatDate(issue.createdAt)}</p>
        ${issue.updatedAt ? `<p>\uD83D\uDD04 Updated: ${formatDate(issue.updatedAt)}</p>` : ""}
      </div>
    </div>
  `;
}

function renderPRs(prs: PullRequest[]): void {
  el("subtitle").textContent = `${prs.length} pull requests`;
  const area = el("content-area");
  area.innerHTML = "";
  for (const pr of prs) {
    const stateClass = pr.state === "open" ? "state-open" : "state-closed";
    const card = document.createElement("div");
    card.className = "result-card clickable";
    card.innerHTML = `
      <p class="result-title">#${pr.number} ${escapeHtml(pr.title)}</p>
      <p class="result-meta"><span class="state-badge ${stateClass}">${pr.state}</span> by ${escapeHtml(pr.author)}</p>
    `;
    card.addEventListener("click", () => {
      loadPRDetail(currentOwner, currentRepo, pr.number);
    });
    area.appendChild(card);
  }
}

async function loadPRDetail(
  owner: string,
  repo: string,
  number: number
): Promise<void> {
  const restoreFn = saveCurrentView();
  navigationStack.push(restoreFn);
  showBackButton(() => {
    const fn = navigationStack.pop();
    if (fn) fn();
  });

  el("subtitle").textContent = `PR #${number}`;
  el("content-area").innerHTML = '<p class="loading">Loading PR details...</p>';

  try {
    const result = await app.callServerTool({
      name: "get_pr_detail",
      arguments: { owner, repo, number: number.toString() },
    });
    const detail = parseStructuredOrText<PRDetail>(result);
    if (detail) {
      renderPRDetail(detail);
    }
  } catch (e) {
    el("content-area").innerHTML = `<p class="loading">Error loading details: ${e}</p>`;
  }
}

function renderPRDetail(pr: PRDetail): void {
  el("subtitle").textContent = `#${pr.number} ${pr.title}`;
  const stateClass = pr.state === "open" ? "state-open" : "state-closed";
  const mergedBadge = pr.mergedAt
    ? '<span class="state-badge state-merged">merged</span>'
    : "";
  const area = el("content-area");
  area.innerHTML = `
    <div class="detail-view">
      <div class="detail-header-row">
        <span class="state-badge ${stateClass}">${pr.state}</span>
        ${mergedBadge}
        <span class="detail-author">by ${escapeHtml(pr.author)}</span>
      </div>
      <h2 class="detail-title">#${pr.number} ${escapeHtml(pr.title)}</h2>
      ${
        pr.labels.length > 0
          ? `<div class="tag-list">${pr.labels
              .map(
                (l) =>
                  `<span class="tag" style="background:#${l.color}22;color:#${l.color};border:1px solid #${l.color}44">${escapeHtml(l.name)}</span>`
              )
              .join("")}</div>`
          : ""
      }
      <p class="detail-field"><strong>Branch:</strong> ${escapeHtml(pr.head)} \u2192 ${escapeHtml(pr.base)}</p>
      <div class="detail-grid">
        <div class="detail-stat"><span class="stat-value addition">+${pr.additions}</span><span class="stat-label">Additions</span></div>
        <div class="detail-stat"><span class="stat-value deletion">-${pr.deletions}</span><span class="stat-label">Deletions</span></div>
        <div class="detail-stat"><span class="stat-value">${pr.changedFiles}</span><span class="stat-label">Files</span></div>
      </div>
      <div class="detail-body">${pr.body ? escapeHtml(pr.body) : "<em>No description provided.</em>"}</div>
      <div class="detail-meta">
        <p>\uD83D\uDCC5 Created: ${formatDate(pr.createdAt)}</p>
        <p>\uD83D\uDD04 Updated: ${formatDate(pr.updatedAt)}</p>
        ${pr.mergedAt ? `<p>\u2705 Merged: ${formatDate(pr.mergedAt)}</p>` : ""}
      </div>
    </div>
  `;
}

function renderCreatedIssue(data: CreatedIssue): void {
  el("subtitle").textContent = "Issue created successfully";
  const area = el("content-area");
  area.innerHTML = `
    <div class="result-card success-card">
      <p class="result-title">\u2705 Issue Created</p>
      <p class="result-desc">${escapeHtml(data.url)}</p>
    </div>
  `;
}

function renderFileContent(content: string): void {
  el("subtitle").textContent = "File contents";
  const area = el("content-area");
  area.innerHTML = "";
  const pre = document.createElement("pre");
  pre.className = "code-block";
  pre.textContent = content;
  area.appendChild(pre);
}

// --- View State Management ---

function saveCurrentView(): () => void {
  const savedData = lastRenderedData;
  return () => {
    if (savedData) {
      renderView(savedData);
    }
  };
}

function renderView(data: GitHubResult): void {
  if (typeof data === "string") {
    renderFileContent(data);
  } else if (isRepoArray(data)) {
    renderRepos(data);
  } else if (isPRArray(data)) {
    renderPRs(data);
  } else if (isIssueArray(data)) {
    renderIssues(data);
  } else if (isCreatedIssue(data)) {
    renderCreatedIssue(data);
  } else {
    el("content-area").textContent = JSON.stringify(data, null, 2);
  }
}

// --- Main Render Dispatcher ---

function render(data: GitHubResult): void {
  hideBackButton();
  navigationStack = [];
  lastRenderedData = data;
  renderView(data);
}

function parseStructuredOrText<T>(result: {
  structuredContent?: Record<string, unknown>;
  content?: Array<{ type: string; text?: string }>;
}): T | null {
  if (result.structuredContent) {
    const sc = result.structuredContent;
    // Unwrap { items: [...] } wrapper used for list results
    if ("items" in sc && Array.isArray(sc.items)) {
      return sc.items as T;
    }
    return sc as T;
  }
  const textBlock = result.content?.find((c) => c.type === "text" && c.text) as
    | { type: string; text?: string }
    | undefined;
  if (!textBlock?.text) return null;
  try {
    return JSON.parse(textBlock.text) as T;
  } catch {
    return null;
  }
}

function applyTheme(theme: string | undefined): void {
  document.documentElement.dataset.theme = theme || "dark";
}

// --- App Setup ---

const app = new App({ name: "GitHub Widget", version: "1.0.0" });

app.ontoolinput = (params) => {
  const args = params.arguments as Record<string, string>;
  if (args?.query) {
    el("subtitle").textContent = `Searching: ${args.query}`;
  } else if (args?.owner && args?.repo) {
    currentOwner = args.owner;
    currentRepo = args.repo;
    el("subtitle").textContent = `${args.owner}/${args.repo}`;
  }
  el("content-area").innerHTML = '<p class="loading">Loading...</p>';
  app.sendLog({
    level: "info",
    data: `GitHub request: ${JSON.stringify(params.arguments)}`,
  });
};

app.ontoolresult = (params) => {
  const data = parseStructuredOrText<GitHubResult>(params);
  if (data) {
    render(data);
  } else {
    el("content-area").textContent = "Error parsing result";
  }
};

app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) applyTheme(ctx.theme);
};

await app.connect();
applyTheme(app.getHostContext()?.theme);
el("footer").textContent = "Connected";
