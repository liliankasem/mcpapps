import { App } from "@modelcontextprotocol/ext-apps";

const el = (id: string) => document.getElementById(id)!;

interface Container {
  name: string;
}

interface BlobItem {
  name: string;
  size: number | null;
  contentType: string | null;
  lastModified: string | null;
}

interface OperationResult {
  message?: string;
  error?: string;
}

interface BinaryBlobInfo {
  message: string;
  contentType: string;
  size: number;
  hexPreview: string;
}

type BlobResult = Container[] | BlobItem[] | OperationResult | string;

let navigationStack: Array<() => void> = [];
let currentContainer = "";

function saveCurrentView(): () => void {
  const subtitle = el("subtitle").textContent || "";
  const contentHTML = el("content-area").innerHTML;
  const icon = el("storage-icon").textContent || "📦";
  return () => {
    el("subtitle").textContent = subtitle;
    el("content-area").innerHTML = contentHTML;
    el("storage-icon").textContent = icon;
    reattachHandlers();
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

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isContainerArray(data: unknown): data is Container[] {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    "name" in data[0] &&
    !("size" in data[0])
  );
}

function isBlobArray(data: unknown): data is BlobItem[] {
  return Array.isArray(data) && data.length > 0 && "size" in data[0];
}

function isOperationResult(data: unknown): data is OperationResult {
  return (
    typeof data === "object" &&
    data !== null &&
    ("message" in data || "error" in data) &&
    !Array.isArray(data)
  );
}

// --- Render Functions ---

function renderContainers(containers: Container[]): void {
  el("subtitle").textContent = `${containers.length} containers`;
  el("storage-icon").textContent = "📦";
  const area = el("content-area");
  area.innerHTML = "";
  for (const c of containers) {
    const card = document.createElement("div");
    card.className = "result-card clickable";
    card.dataset.container = c.name;
    card.innerHTML = `
      <p class="result-title">📁 ${escapeHtml(c.name)}</p>
      <p class="result-meta">Click to browse blobs →</p>
    `;
    card.addEventListener("click", () => browseContainer(c.name));
    area.appendChild(card);
  }
}

async function browseContainer(containerName: string): Promise<void> {
  const restoreFn = saveCurrentView();
  navigationStack.push(restoreFn);
  showBackButton(() => {
    const fn = navigationStack.pop();
    if (fn) fn();
  });

  currentContainer = containerName;
  el("subtitle").textContent = `Container: ${containerName}`;
  el("storage-icon").textContent = "📂";
  el("content-area").innerHTML = '<p class="loading">Loading blobs...</p>';

  try {
    const result = await app.callServerTool({
      name: "list_blobs",
      arguments: { containerName },
    });
    const text = result.content?.find(
      (c: { type: string; text?: string }) => c.type === "text"
    ) as { type: string; text?: string } | undefined;

    if (text?.text) {
      const blobs = JSON.parse(text.text) as BlobItem[];
      renderBlobsInteractive(blobs, containerName);
    }
  } catch (e) {
    el("content-area").innerHTML = `<p class="loading">Error: ${e}</p>`;
  }
}

function renderBlobsInteractive(
  blobs: BlobItem[],
  containerName: string
): void {
  el("subtitle").textContent = `${containerName} — ${blobs.length} blobs`;
  const area = el("content-area");
  area.innerHTML = "";

  if (blobs.length === 0) {
    area.innerHTML = '<p class="loading">Container is empty</p>';
    return;
  }

  for (const b of blobs) {
    const card = document.createElement("div");
    card.className = "result-card clickable";
    card.dataset.blob = b.name;
    card.dataset.container = containerName;
    card.innerHTML = `
      <p class="result-title">📄 ${escapeHtml(b.name)}</p>
      <p class="result-meta">${formatSize(b.size)} · ${escapeHtml(b.contentType || "unknown")}${b.lastModified ? ` · ${formatDate(b.lastModified)}` : ""}</p>
    `;
    card.addEventListener("click", () => readBlob(containerName, b.name));
    area.appendChild(card);
  }
}

async function readBlob(
  containerName: string,
  blobName: string
): Promise<void> {
  const restoreFn = saveCurrentView();
  navigationStack.push(restoreFn);
  showBackButton(() => {
    const fn = navigationStack.pop();
    if (fn) fn();
  });

  el("subtitle").textContent = `${containerName}/${blobName}`;
  el("storage-icon").textContent = "📄";
  el("content-area").innerHTML = '<p class="loading">Reading blob...</p>';

  try {
    const result = await app.callServerTool({
      name: "read_blob",
      arguments: { containerName, blobName },
    });
    const text = result.content?.find(
      (c: { type: string; text?: string }) => c.type === "text"
    ) as { type: string; text?: string } | undefined;

    if (text?.text) {
      renderBlobContent(text.text, blobName);
    } else {
      el("content-area").innerHTML = '<p class="loading">Empty blob</p>';
    }
  } catch (e) {
    el("content-area").innerHTML = `<p class="loading">Error: ${e}</p>`;
  }
}

function renderBlobContent(content: string, blobName: string): void {
  el("subtitle").textContent = blobName;
  const area = el("content-area");
  area.innerHTML = "";

  // Check if this is a binary blob info response
  try {
    const parsed = JSON.parse(content) as BinaryBlobInfo;
    if (parsed.hexPreview && parsed.contentType) {
      area.innerHTML = `
        <div class="result-card">
          <p class="result-title">${escapeHtml(parsed.message)}</p>
          <p class="result-meta">Type: ${escapeHtml(parsed.contentType)} · Size: ${formatSize(parsed.size)}</p>
        </div>
        ${parsed.hexPreview ? `<pre class="code-block hex-block">${formatHex(parsed.hexPreview)}</pre>` : ""}
      `;
      return;
    }
  } catch {
    // Not JSON — render as plain text
  }

  const pre = document.createElement("pre");
  pre.className = "code-block";
  pre.textContent = content;
  area.appendChild(pre);
}

function formatHex(hex: string): string {
  const lines: string[] = [];
  for (let i = 0; i < hex.length; i += 32) {
    const chunk = hex.slice(i, i + 32);
    const offset = (i / 2).toString(16).padStart(8, "0");
    const pairs = chunk.match(/.{1,2}/g)?.join(" ") || "";
    lines.push(`${offset}  ${pairs}`);
  }
  return lines.join("\n");
}

function renderBlobs(blobs: BlobItem[]): void {
  el("subtitle").textContent = `${blobs.length} blobs`;
  const area = el("content-area");
  area.innerHTML = "";
  for (const b of blobs) {
    const card = document.createElement("div");
    card.className = "result-card clickable";
    card.dataset.blob = b.name;
    card.innerHTML = `
      <p class="result-title">📄 ${escapeHtml(b.name)}</p>
      <p class="result-meta">${formatSize(b.size)} · ${escapeHtml(b.contentType || "unknown")}${b.lastModified ? ` · ${formatDate(b.lastModified)}` : ""}</p>
    `;
    card.addEventListener("click", () =>
      readBlob(currentContainer, b.name)
    );
    area.appendChild(card);
  }
}

function renderOperation(result: OperationResult): void {
  const area = el("content-area");
  if (result.error) {
    el("subtitle").textContent = "Error";
    el("storage-icon").textContent = "⚠️";
    area.innerHTML = `<div class="result-card error-card"><p class="result-title">${escapeHtml(result.error)}</p></div>`;
  } else if (result.message) {
    el("subtitle").textContent = "Success";
    el("storage-icon").textContent = "✅";
    area.innerHTML = `<div class="result-card success-card"><p class="result-title">${escapeHtml(result.message)}</p></div>`;
  }
}

function reattachHandlers(): void {
  // Reattach container click handlers
  el("content-area")
    .querySelectorAll(".result-card[data-container]:not([data-blob])")
    .forEach((card) => {
      const name = (card as HTMLElement).dataset.container!;
      card.addEventListener("click", () => browseContainer(name));
    });
  // Reattach blob click handlers
  el("content-area")
    .querySelectorAll(".result-card[data-blob]")
    .forEach((card) => {
      const blob = (card as HTMLElement).dataset.blob!;
      const container = (card as HTMLElement).dataset.container || currentContainer;
      card.addEventListener("click", () => readBlob(container, blob));
    });
}

// --- Main Render ---

function render(data: BlobResult): void {
  hideBackButton();
  navigationStack = [];
  el("storage-icon").textContent = "📦";

  if (typeof data === "string") {
    renderBlobContent(data, "");
    el("subtitle").textContent = "Blob content";
  } else if (Array.isArray(data) && data.length === 0) {
    el("subtitle").textContent = "Empty result";
    el("content-area").innerHTML = '<p class="loading">No items found</p>';
  } else if (isContainerArray(data)) {
    renderContainers(data);
  } else if (isBlobArray(data)) {
    renderBlobs(data);
  } else if (isOperationResult(data)) {
    renderOperation(data);
  } else {
    el("content-area").textContent = JSON.stringify(data, null, 2);
  }
}

function parseToolResultContent(
  content: Array<{ type: string; text?: string }> | undefined
): BlobResult | null {
  if (!content || content.length === 0) return null;
  const textBlock = content.find((c) => c.type === "text" && c.text);
  if (!textBlock?.text) return null;

  try {
    return JSON.parse(textBlock.text) as BlobResult;
  } catch {
    return textBlock.text;
  }
}

function applyTheme(theme: string | undefined): void {
  document.documentElement.dataset.theme = theme || "dark";
}

// --- App Setup ---

const app = new App({ name: "Blob Storage Widget", version: "1.0.0" });

app.ontoolinput = (params) => {
  const args = params.arguments as Record<string, string>;
  if (args?.containerName && args?.blobName) {
    currentContainer = args.containerName;
    el("subtitle").textContent = `${args.containerName}/${args.blobName}`;
  } else if (args?.containerName) {
    currentContainer = args.containerName;
    el("subtitle").textContent = `Container: ${args.containerName}`;
  } else {
    el("subtitle").textContent = "Loading...";
  }
  el("content-area").innerHTML = '<p class="loading">Loading...</p>';
  app.sendLog({
    level: "info",
    data: `Blob request: ${JSON.stringify(params.arguments)}`,
  });
};

app.ontoolresult = (params) => {
  const data = parseToolResultContent(
    params.content as Array<{ type: string; text?: string }>
  );
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
