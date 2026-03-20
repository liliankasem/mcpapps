import { App } from "@modelcontextprotocol/ext-apps";

const el = (id: string) => document.getElementById(id)!;

// --- Types ---

interface EmailItem {
  subject: string;
  from: string | null;
  receivedAt: string | null;
  preview: string | null;
  isRead: boolean | null;
  url: string | null;
}

interface CalendarEvent {
  subject: string;
  start: string | null;
  startTimeZone: string | null;
  end: string | null;
  endTimeZone: string | null;
  location: string | null;
  organizer: string | null;
  isAllDay: boolean | null;
  url: string | null;
}

interface SentEmail {
  to: string;
  subject: string;
  cc: string | null;
  status: string;
}

interface CreatedEvent {
  id: string | null;
  subject: string | null;
  start: string | null;
  end: string | null;
  url: string | null;
}

type ToolResult =
  | { items: EmailItem[] }
  | { items: CalendarEvent[] }
  | SentEmail
  | CreatedEvent;

// --- Helpers ---

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// --- Renderers ---

function renderEmails(items: EmailItem[]): string {
  if (items.length === 0) {
    return `<div class="result-card"><p class="result-desc">No emails found.</p></div>`;
  }

  return items
    .map(
      (m) => `
    <div class="result-card">
      <p class="result-title">${escapeHtml(m.subject || "(No subject)")}</p>
      <p class="result-desc">${escapeHtml(m.preview || "")}</p>
      <div class="result-meta">
        <span class="badge ${m.isRead ? "badge-read" : "badge-unread"}">${m.isRead ? "Read" : "Unread"}</span>
        <span>From: ${escapeHtml(m.from || "Unknown")}</span>
        <span>${formatDate(m.receivedAt)}</span>
        ${m.url ? `<a href="${escapeHtml(m.url)}" target="_blank" style="color: var(--accent);">Open ↗</a>` : ""}
      </div>
    </div>`
    )
    .join("");
}

function renderEvents(items: CalendarEvent[]): string {
  if (items.length === 0) {
    return `<div class="result-card"><p class="result-desc">No events found.</p></div>`;
  }

  return items
    .map(
      (e) => `
    <div class="result-card">
      <p class="result-title">${escapeHtml(e.subject || "(No title)")}</p>
      <div class="time-block">
        <span class="dot"></span>
        <span>${formatDate(e.start)} — ${formatTime(e.end)}</span>
        ${e.isAllDay ? `<span class="badge badge-allday">All Day</span>` : ""}
      </div>
      <div class="result-meta" style="margin-top: 6px;">
        <span class="badge badge-event">Event</span>
        ${e.location ? `<span>📍 ${escapeHtml(e.location)}</span>` : ""}
        ${e.organizer ? `<span>👤 ${escapeHtml(e.organizer)}</span>` : ""}
        ${e.url ? `<a href="${escapeHtml(e.url)}" target="_blank" style="color: var(--accent);">Open ↗</a>` : ""}
      </div>
    </div>`
    )
    .join("");
}

function renderSentEmail(data: SentEmail): string {
  return `
    <div class="result-card success-card">
      <p class="result-title">✅ Email Sent</p>
      <p class="result-desc">To: ${escapeHtml(data.to)}</p>
      <p class="result-desc">Subject: ${escapeHtml(data.subject)}</p>
      ${data.cc ? `<p class="result-desc">CC: ${escapeHtml(data.cc)}</p>` : ""}
      <div class="result-meta">
        <span class="badge badge-sent">Sent</span>
      </div>
    </div>`;
}

function renderCreatedEvent(data: CreatedEvent): string {
  return `
    <div class="result-card success-card">
      <p class="result-title">✅ Event Created</p>
      <p class="result-desc">${escapeHtml(data.subject || "")}</p>
      <div class="time-block">
        <span class="dot"></span>
        <span>${formatDate(data.start)} — ${formatTime(data.end)}</span>
      </div>
      <div class="result-meta" style="margin-top: 6px;">
        <span class="badge badge-event">Created</span>
        ${data.url ? `<a href="${escapeHtml(data.url)}" target="_blank" style="color: var(--accent);">Open ↗</a>` : ""}
      </div>
    </div>`;
}

// --- App ---

function detectAndRender(data: ToolResult): string {
  if ("status" in data && "to" in data) {
    return renderSentEmail(data as SentEmail);
  }

  if ("id" in data && "start" in data && "end" in data) {
    return renderCreatedEvent(data as CreatedEvent);
  }

  if ("items" in data && Array.isArray(data.items)) {
    const items = data.items;
    if (items.length === 0) {
      return `<div class="result-card"><p class="result-desc">No results found.</p></div>`;
    }

    // Distinguish emails from events by checking for email-specific fields
    if ("from" in items[0] || "isRead" in items[0] || "preview" in items[0]) {
      return renderEmails(items as EmailItem[]);
    }

    return renderEvents(items as CalendarEvent[]);
  }

  return `<div class="result-card"><p class="result-desc">${escapeHtml(JSON.stringify(data))}</p></div>`;
}

const app = new App({
  onToolResult: (result) => {
    const contentArea = el("content-area");
    const subtitle = el("subtitle");
    const footer = el("footer");
    const icon = el("widget-icon");

    const text = result.text || "";
    subtitle.textContent = text;

    if (result.structuredContent) {
      const data = result.structuredContent as unknown as ToolResult;

      // Update icon based on content type
      if ("status" in data && "to" in data) {
        icon.textContent = "✉️";
      } else if ("id" in data && "start" in data) {
        icon.textContent = "📅";
      } else if ("items" in data && Array.isArray(data.items) && data.items.length > 0) {
        const first = data.items[0];
        icon.textContent = ("from" in first || "isRead" in first) ? "📧" : "📅";
      }

      contentArea.innerHTML = detectAndRender(data);
    } else {
      contentArea.innerHTML = `<div class="result-card"><p class="result-desc">${escapeHtml(text)}</p></div>`;
    }

    footer.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  },
});

el("footer").textContent = "Connected";
