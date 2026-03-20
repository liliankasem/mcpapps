import { App } from "@modelcontextprotocol/ext-apps";

const el = (id: string) => document.getElementById(id)!;

// Color palette for bounding boxes
const BOX_COLORS = [
  "#0078d4", "#e74c3c", "#2ecc71", "#f39c12",
  "#9b59b6", "#1abc9c", "#e67e22", "#3498db",
];

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TagItem {
  name: string;
  confidence: number;
}

interface ObjectItem {
  name: string | null;
  confidence: number | null;
  boundingBox: BoundingBox;
}

interface PersonItem {
  confidence: number;
  boundingBox: BoundingBox;
}

interface OcrLine {
  text: string;
  boundingPolygon: Array<{ x: number; y: number }>;
}

interface AnalyzeResult {
  imageUrl?: string;
  imageData?: string;
  caption?: { text: string; confidence: number };
  tags?: TagItem[];
  objects?: ObjectItem[];
  people?: PersonItem[];
}

interface OcrResult {
  imageUrl?: string;
  imageData?: string;
  text: string;
  lines?: OcrLine[];
  message?: string;
}

interface DescribeResult {
  imageUrl?: string;
  imageData?: string;
  description?: string;
  tags?: TagItem[];
}

// Minimum confidence to show people detections
const PEOPLE_CONFIDENCE_THRESHOLD = 0.4;

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function pct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

interface BoxItem {
  label: string;
  confidence: number;
  box: BoundingBox;
  color: string;
}

function drawBoxes(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  items: BoxItem[]
): void {
  const ctx = canvas.getContext("2d")!;
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  const fontSize = Math.max(12, Math.round(img.naturalWidth / 50));
  ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
  ctx.lineWidth = Math.max(2, Math.round(img.naturalWidth / 300));

  for (const item of items) {
    const { label, box, color } = item;
    ctx.strokeStyle = color;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    // Label background
    const textMetrics = ctx.measureText(label);
    const labelH = fontSize + 6;
    const labelW = textMetrics.width + 8;
    ctx.fillStyle = color;
    ctx.fillRect(box.x, box.y - labelH, labelW, labelH);

    // Label text
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, box.x + 4, box.y - 4);
  }
}

function setupHoverTooltip(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  items: BoxItem[]
): void {
  // Enable pointer events on canvas for hover
  canvas.style.pointerEvents = "auto";
  canvas.style.cursor = "default";

  const tooltip = document.createElement("div");
  tooltip.className = "box-tooltip";
  tooltip.style.display = "none";
  container.appendChild(tooltip);

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    // Convert mouse position to image coordinates
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    // Find which box the mouse is in (last match = topmost drawn)
    let hit: BoxItem | null = null;
    for (const item of items) {
      const b = item.box;
      if (mx >= b.x && mx <= b.x + b.width && my >= b.y && my <= b.y + b.height) {
        hit = item;
      }
    }

    if (hit) {
      tooltip.textContent = `${hit.label} — ${pct(hit.confidence)}`;
      tooltip.style.borderColor = hit.color;
      tooltip.style.display = "block";
      // Position tooltip relative to container
      tooltip.style.left = `${e.clientX - rect.left + 12}px`;
      tooltip.style.top = `${e.clientY - rect.top - 8}px`;
      canvas.style.cursor = "crosshair";
    } else {
      tooltip.style.display = "none";
      canvas.style.cursor = "default";
    }
  });

  canvas.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
  });
}

function drawOcrOverlay(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  lines: OcrLine[]
): void {
  const ctx = canvas.getContext("2d")!;
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  ctx.lineWidth = Math.max(1, Math.round(img.naturalWidth / 400));

  for (const line of lines) {
    if (!line.boundingPolygon || line.boundingPolygon.length < 2) continue;

    ctx.strokeStyle = "rgba(0, 120, 212, 0.7)";
    ctx.fillStyle = "rgba(0, 120, 212, 0.08)";

    ctx.beginPath();
    ctx.moveTo(line.boundingPolygon[0].x, line.boundingPolygon[0].y);
    for (let i = 1; i < line.boundingPolygon.length; i++) {
      ctx.lineTo(line.boundingPolygon[i].x, line.boundingPolygon[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function renderImageWithOverlay(
  imageUrl: string,
  onLoad: (img: HTMLImageElement, canvas: HTMLCanvasElement, container: HTMLElement) => void
): HTMLElement {
  const container = document.createElement("div");
  container.className = "image-container";

  const img = document.createElement("img");
  img.src = imageUrl;

  const canvas = document.createElement("canvas");
  container.appendChild(img);
  container.appendChild(canvas);

  img.onload = () => onLoad(img, canvas, container);
  img.onerror = () => {
    container.innerHTML = `<p class="loading">Could not load image</p>`;
  };

  return container;
}

function renderTags(tags: TagItem[]): HTMLElement {
  const wrapper = document.createElement("div");

  const label = document.createElement("p");
  label.className = "section-label";
  label.textContent = `Tags (${tags.length})`;
  wrapper.appendChild(label);

  const container = document.createElement("div");
  container.className = "tags-container";

  for (const tag of tags) {
    const el = document.createElement("span");
    el.className = "tag";
    el.innerHTML = `
      <span class="tag-name">${escapeHtml(tag.name)}</span>
      <span class="confidence-bar-bg">
        <span class="confidence-bar-fill" style="width: ${tag.confidence * 100}%"></span>
      </span>
      <span class="tag-confidence">${pct(tag.confidence)}</span>
    `;
    container.appendChild(el);
  }

  wrapper.appendChild(container);
  return wrapper;
}

function renderAnalyze(data: AnalyzeResult): void {
  el("vision-icon").textContent = "🔍";
  el("subtitle").textContent = "Image analysis";
  const area = el("content-area");
  area.innerHTML = "";

  const imageUrl = data.imageData || data.imageUrl || "";

  // Filter people to only show high-confidence detections
  const filteredPeople = data.people?.filter(p => p.confidence >= PEOPLE_CONFIDENCE_THRESHOLD) || [];

  // Build bounding box items for the overlay
  const boxItems: BoxItem[] = [];
  let colorIdx = 0;

  if (data.objects) {
    for (const obj of data.objects) {
      boxItems.push({
        label: obj.name || "object",
        confidence: obj.confidence ?? 0,
        box: obj.boundingBox,
        color: BOX_COLORS[colorIdx % BOX_COLORS.length],
      });
      colorIdx++;
    }
  }

  if (filteredPeople.length > 0) {
    for (let i = 0; i < filteredPeople.length; i++) {
      boxItems.push({
        label: `Person`,
        confidence: filteredPeople[i].confidence,
        box: filteredPeople[i].boundingBox,
        color: BOX_COLORS[colorIdx % BOX_COLORS.length],
      });
      colorIdx++;
    }
  }

  // Image with bounding box overlay + hover tooltips
  if (imageUrl && boxItems.length > 0) {
    area.appendChild(
      renderImageWithOverlay(imageUrl, (img, canvas, container) => {
        drawBoxes(canvas, img, boxItems);
        setupHoverTooltip(container, canvas, img, boxItems);
      })
    );
  } else if (imageUrl) {
    area.appendChild(
      renderImageWithOverlay(imageUrl, () => {})
    );
  }

  if (data.tags && data.tags.length > 0) {
    area.appendChild(renderTags(data.tags));
  }
}

function renderOcr(data: OcrResult): void {
  el("vision-icon").textContent = "📝";
  el("subtitle").textContent = "Text extraction (OCR)";
  const area = el("content-area");
  area.innerHTML = "";

  const imageUrl = data.imageData || data.imageUrl || "";

  // Image with OCR line overlay
  if (imageUrl && data.lines && data.lines.length > 0) {
    area.appendChild(
      renderImageWithOverlay(imageUrl, (img, canvas, _container) => {
        drawOcrOverlay(canvas, img, data.lines!);
      })
    );
  } else if (imageUrl) {
    area.appendChild(
      renderImageWithOverlay(imageUrl, () => {})
    );
  }

  if (!data.text && data.message) {
    area.innerHTML += `<p class="loading">${escapeHtml(data.message)}</p>`;
    return;
  }

  const label = document.createElement("p");
  label.className = "section-label";
  label.textContent = "Extracted text";
  area.appendChild(label);

  const textBlock = document.createElement("pre");
  textBlock.className = "ocr-text";
  textBlock.textContent = data.text;
  area.appendChild(textBlock);
}

function renderDescribe(data: DescribeResult): void {
  el("vision-icon").textContent = "💬";
  el("subtitle").textContent = "Image description";
  const area = el("content-area");
  area.innerHTML = "";

  const imageUrl = data.imageData || data.imageUrl || "";

  if (imageUrl) {
    area.appendChild(
      renderImageWithOverlay(imageUrl, () => {})
    );
  }

  if (data.description) {
    const label = document.createElement("p");
    label.className = "section-label";
    label.textContent = "Description";
    area.appendChild(label);

    const desc = document.createElement("p");
    desc.className = "description-text";
    desc.textContent = data.description;
    area.appendChild(desc);
  }

  if (data.tags && data.tags.length > 0) {
    area.appendChild(renderTags(data.tags));
  }
}

function detectAndRender(data: Record<string, unknown>): void {
  try {
    // Detect result type from data shape
    if ("text" in data || "lines" in data) {
      renderOcr(data as unknown as OcrResult);
    } else if ("objects" in data || "people" in data) {
      renderAnalyze(data as unknown as AnalyzeResult);
    } else if ("description" in data) {
      renderDescribe(data as unknown as DescribeResult);
    } else if ("tags" in data) {
      // Tags-only could be either analyze or describe; render as analyze
      renderAnalyze(data as unknown as AnalyzeResult);
    } else {
      el("content-area").innerHTML = `<pre class="ocr-text">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
    }
  } catch (e) {
    el("content-area").innerHTML = `<div class="error-card">Error rendering: ${e}</div>`;
  }
}

function applyTheme(theme: string | undefined): void {
  document.documentElement.dataset.theme = theme || "dark";
}

// --- App Setup ---

const app = new App({ name: "AI Vision Widget", version: "1.0.0" });

app.ontoolinput = (params) => {
  el("subtitle").textContent = "Analyzing…";
  el("content-area").innerHTML = '<p class="loading">Loading…</p>';
  app.sendLog({
    level: "info",
    data: `Vision request: ${JSON.stringify(params.arguments)}`,
  });
};

app.ontoolresult = (params) => {
  const content = params.content as Array<{ type: string; text?: string }> | undefined;
  if (!content || content.length === 0) {
    el("content-area").innerHTML = '<p class="loading">No result</p>';
    return;
  }

  const textBlock = content.find((c) => c.type === "text" && c.text);
  if (!textBlock?.text) {
    el("content-area").innerHTML = '<p class="loading">No result</p>';
    return;
  }

  try {
    const data = JSON.parse(textBlock.text) as Record<string, unknown>;
    detectAndRender(data);
  } catch {
    el("content-area").innerHTML = `<pre class="ocr-text">${escapeHtml(textBlock.text)}</pre>`;
  }
};

app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) applyTheme(ctx.theme);
};

await app.connect();
applyTheme(app.getHostContext()?.theme);
el("footer").textContent = "Connected";
