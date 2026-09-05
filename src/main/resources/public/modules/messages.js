/*
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { escapeHtml, formatTime, syntaxHighlight } from "./utils.js";

export async function renderMessagesView(container, conversationId, flavor) {
  container.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; height:200px; color:var(--text-secondary);">
      <div class="loading-state">Loading subagent messages...</div>
    </div>
  `;

  try {
    const res = await fetch(
      `/api/brain/conversations/${conversationId}/messages?flavor=${encodeURIComponent(
        flavor
      )}`
    );
    const messages = res.ok ? await res.json() : [];

    const counterBadge = document.getElementById("messages-counter");
    if (counterBadge) {
      counterBadge.innerText = `${messages.length}`;
    }

    if (messages.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="margin-top: 48px;">
          <div class="empty-icon">💬</div>
          <p>No subagent or reactive inter-agent messages found in this session.</p>
        </div>
      `;
      return;
    }

    let html = `
      <div style="max-width: 900px; margin: 0 auto; display:flex; flex-direction:column; gap:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:0.8rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em;">Subagent & Task Message Activity (${messages.length})</span>
        </div>
    `;

    messages.forEach((msg, idx) => {
      const isHighPriority = msg.priority === "MESSAGE_PRIORITY_HIGH";
      const priorityColor = isHighPriority ? "#ef4444" : "#60a5fa";
      const priorityBg = isHighPriority
        ? "rgba(239, 68, 68, 0.15)"
        : "rgba(59, 130, 246, 0.15)";
      const title = msg.renderDetails?.messageTitle || "Inter-Agent Message";
      const sender = msg.sender || "System";
      const recipient = msg.recipient || "Agent";
      const content = msg.content || "";
      const sourceMeta = msg.sourceMetadata;

      html += `
        <div class="message-card" style="background:rgba(30, 41, 59, 0.4); border:1px solid var(--border-color); border-radius:10px; overflow:hidden; transition:all 0.2s;">
          <div style="padding:12px 16px; background:rgba(15, 23, 42, 0.5); border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:1.1rem;">📨</span>
              <div>
                <div style="font-weight:600; font-size:0.9rem; color:var(--text-primary);">${escapeHtml(
                  title
                )}</div>
                <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">
                  From: <code style="color:#a78bfa;">${escapeHtml(
                    sender
                  )}</code> → To: <code style="color:#60a5fa;">${escapeHtml(
        recipient
      )}</code>
                </div>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:0.7rem; font-weight:700; padding:2px 8px; border-radius:4px; background:${priorityBg}; color:${priorityColor}; border:1px solid ${priorityColor}40;">
                ${escapeHtml(msg.priority || "NORMAL")}
              </span>
              <span style="font-size:0.75rem; color:var(--text-secondary);">${formatTime(
                msg.timestamp,
                true
              )}</span>
            </div>
          </div>
          
          <div style="padding:16px;">
            ${
              content
                ? `<div class="markdown-body" style="font-size:0.9rem; max-height:300px; overflow-y:auto;">${marked.parse(
                    content
                  )}</div>`
                : ""
            }
            
            ${
              sourceMeta
                ? `
              <div style="margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.05); font-size:0.75rem; color:var(--text-secondary);">
                <div style="font-weight:600; margin-bottom:4px; color:var(--text-primary);">Source Metadata:</div>
                <pre class="code-block" style="margin:0; padding:8px 12px; font-size:0.75rem;"><code>${syntaxHighlight(
                  JSON.stringify(sourceMeta, null, 2)
                )}</code></pre>
              </div>
            `
                : ""
            }
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div class="error-msg" style="color:var(--error); padding:24px;">Failed to load messages view: ${escapeHtml(
      err.message
    )}</div>`;
  }
}
