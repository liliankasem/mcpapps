import { App } from "@modelcontextprotocol/ext-apps";

const el = (id: string) => document.getElementById(id)!;

let navigationStack: Array<() => void> = [];

function saveCurrentView(): () => void {
  const urlText = el("url-display").textContent || "";
  const contentHTML = el("content-area").innerHTML;
  const linksDisplay = el("links-section").style.display;
  const linksHTML = el("links-list").innerHTML;
  return () => {
    el("url-display").textContent = urlText;
    el("content-area").innerHTML = contentHTML;
    el("links-section").style.display = linksDisplay;
    el("links-list").innerHTML = linksHTML;
    reattachLinkHandlers();
  };
}

function showBackButton(onBack: () => void): void {
  let backBtn = document.getElementById("back-btn");
  if (!backBtn) {
    backBtn = document.createElement("button");
    backBtn.id = "back-btn";
    backBtn.className = "back-btn";
    backBtn.textContent = "← Back";
    const header = el("header-area");
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

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Parse a markdown-style link "- [text](url)" and return {text, url}
function parseMarkdownLink(line: string): { text: string; url: string } | null {
  const match = line.match(/^-\s*\[([^\]]*)\]\(([^)]+)\)/);
  if (match) {
    return { text: match[1], url: match[2] };
  }
  return null;
}

function renderContent(text: string): void {
  el("content-area").innerHTML = "";
  el("links-section").style.display = "none";
  const pre = document.createElement("pre");
  pre.className = "content-text";
  pre.textContent = text;
  el("content-area").appendChild(pre);
}

function renderLinks(lines: string[]): void {
  el("content-area").innerHTML = '<p class="hint">Click a link to fetch its content</p>';
  el("links-section").style.display = "block";
  const list = el("links-list");
  list.innerHTML = "";

  for (const line of lines) {
    const parsed = parseMarkdownLink(line);
    const li = document.createElement("li");
    li.className = "link-item";

    if (parsed) {
      li.innerHTML = `<span class="link-text">${escapeHtml(parsed.text)}</span><span class="link-url">${escapeHtml(parsed.url)}</span>`;
      li.addEventListener("click", () => fetchUrl(parsed.url));
    } else {
      li.textContent = line;
    }

    list.appendChild(li);
  }
}

function reattachLinkHandlers(): void {
  const items = el("links-list").querySelectorAll(".link-item");
  items.forEach((item) => {
    const urlEl = item.querySelector(".link-url");
    if (urlEl) {
      const url = urlEl.textContent || "";
      item.addEventListener("click", () => fetchUrl(url));
    }
  });
}

async function fetchUrl(url: string): Promise<void> {
  const restoreFn = saveCurrentView();
  navigationStack.push(restoreFn);
  showBackButton(() => {
    const fn = navigationStack.pop();
    if (fn) fn();
  });

  el("url-display").textContent = url;
  el("fetch-icon").textContent = "⏳";
  el("content-area").innerHTML = '<p class="hint">Fetching page...</p>';
  el("links-section").style.display = "none";

  try {
    const result = await app.callServerTool({
      name: "fetch_url",
      arguments: { url },
    });
    const text = result.content?.find(
      (c: { type: string; text?: string }) => c.type === "text"
    ) as { type: string; text?: string } | undefined;

    el("fetch-icon").textContent = "🌐";
    if (text?.text) {
      renderContent(text.text);
    } else {
      el("content-area").innerHTML = '<p class="hint">No content returned</p>';
    }
    el("footer").textContent = `Fetched ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    el("fetch-icon").textContent = "⚠️";
    el("content-area").innerHTML = `<p class="hint">Error: ${e}</p>`;
  }
}

function render(text: string): void {
  hideBackButton();
  navigationStack = [];

  el("fetch-icon").textContent = "🌐";

  // Check if it looks like a link list
  if (text.includes("\n- [") || text.startsWith("- [")) {
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    renderLinks(lines);
  } else {
    renderContent(text);
  }

  el("footer").textContent = `Fetched ${new Date().toLocaleTimeString()}`;
}

function parseToolResultContent(
  content: Array<{ type: string; text?: string }> | undefined
): string | null {
  if (!content || content.length === 0) return null;
  const textBlock = content.find((c) => c.type === "text" && c.text);
  if (!textBlock?.text) return null;
  return textBlock.text;
}

function applyTheme(theme: string | undefined): void {
  document.documentElement.dataset.theme = theme || "dark";
}

const app = new App({ name: "WebFetch Widget", version: "1.0.0" });

app.ontoolinput = (params) => {
  const args = params.arguments as Record<string, string>;
  if (args?.url) {
    el("url-display").textContent = args.url;
    el("content-area").innerHTML = '<p class="hint">Fetching...</p>';
  }
  app.sendLog({
    level: "info",
    data: `Fetching: ${JSON.stringify(params.arguments)}`,
  });
};

app.ontoolresult = (params) => {
  const text = parseToolResultContent(
    params.content as Array<{ type: string; text?: string }>
  );
  if (text) {
    render(text);
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
