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
import { escapeHtml, formatTime, renderMarkdown } from "./utils.js";

export async function renderSwarmView(container, conversationId, flavor) {
  container.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; height:200px; color:var(--text-secondary);">
      <div class="loading-state">Loading swarm &amp; subagent details...</div>
    </div>
  `;

  try {
    const res = await fetch(
      `/api/brain/conversations/${conversationId}/swarm?flavor=${encodeURIComponent(
        flavor
      )}`
    );
    const data = res.ok ? await res.json() : { hasSwarm: false, subagents: [] };

    const membersMap = data.members?.members || {};
    const memberEntries = Object.entries(membersMap);
    const subagents = Array.isArray(data.subagents) ? data.subagents : [];
    const board = Array.isArray(data.board) ? data.board : [];
    const plan = data.plan || null;
    const swarmMeta = data.swarm || null;

    if (!data.hasSwarm && subagents.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="margin-top: 48px;">
          <div class="empty-icon">🐝</div>
          <p>No multi-agent swarm or subagent descriptors recorded for this session.</p>
        </div>
      `;
      return;
    }

    let html = `<div style="max-width: 960px; margin: 0 auto; display:flex; flex-direction:column; gap:20px;">`;

    // 1. Swarm Overview & Plan
    if (swarmMeta || plan || data.members?.title) {
      const title =
        plan?.goal?.title || data.members?.title || "Multi-Agent Swarm Session";
      const goalLine = plan?.goal?.line || "";
      const tasks = plan?.tasks ? Object.entries(plan.tasks) : [];

      html += `
        <div class="swarm-section-card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
            <div>
              <div style="font-size:0.75rem; font-weight:700; color:#f59e0b; text-transform:uppercase; letter-spacing:0.05em;">🐝 Swarm Overview</div>
              <h3 style="margin:4px 0 6px; font-size:1.05rem; color:var(--text-primary);">${escapeHtml(
                title
              )}</h3>
              ${
                goalLine
                  ? `<p style="margin:0; font-size:0.88rem; color:var(--text-secondary); line-height:1.5;">${escapeHtml(
                      goalLine
                    )}</p>`
                  : ""
              }
            </div>
            ${
              swarmMeta?.created_at
                ? `<span style="font-size:0.75rem; color:var(--text-secondary);">Created: ${formatTime(
                    swarmMeta.created_at,
                    true
                  )}</span>`
                : ""
            }
          </div>
          ${
            tasks.length > 0
              ? `<div style="margin-top:14px; padding-top:12px; border-top:1px solid var(--border-color); display:flex; flex-direction:column; gap:6px;">
                  <div style="font-size:0.72rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase;">Assigned Workstreams</div>
                  ${tasks
                    .map(
                      ([owner, desc]) => `
                    <div style="display:flex; gap:10px; align-items:baseline; font-size:0.85rem;">
                      <span class="step-model-chip">@${escapeHtml(owner)}</span>
                      <span style="color:var(--text-primary);">${escapeHtml(
                        desc
                      )}</span>
                    </div>
                  `
                    )
                    .join("")}
                </div>`
              : ""
          }
        </div>
      `;
    }

    // 2. Swarm Members Roster
    if (memberEntries.length > 0) {
      html += `
        <div class="swarm-section-card">
          <div style="font-size:0.75rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px;">
            Swarm Roster (${memberEntries.length})
          </div>
          <div class="swarm-roster-grid">
            ${memberEntries
              .map(([name, m]) => {
                const convId = m.conversation_id || "";
                const model = m.applied_model || m.desired_model || "";
                const stateLabel = m.phase || m.desired_state || "UNKNOWN";
                const wsMode = m.workspace_mode || "inherit";
                const convLink = convId
                  ? `<a href="#${convId}" class="conv-link" data-conv-id="${convId}" title="Open worker transcript (${escapeHtml(
                      convId
                    )})"><code>${escapeHtml(
                      convId.substring(0, 8)
                    )}</code><span class="jump-icon">↗</span></a>`
                  : "";
                return `
                  <div class="swarm-member-card">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                      <span style="font-weight:600; color:var(--text-primary); font-family:var(--font-mono);">@${escapeHtml(
                        name
                      )}</span>
                      <span class="step-tokens-chip">${escapeHtml(
                        stateLabel
                      )}</span>
                    </div>
                    <div style="font-size:0.78rem; color:var(--text-secondary); display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-top:8px;">
                      ${
                        m.role
                          ? `<span>Role: <strong>${escapeHtml(
                              m.role
                            )}</strong></span>`
                          : ""
                      }
                      <span>· Workspace: <code>${escapeHtml(
                        wsMode
                      )}</code></span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:10px; flex-wrap:wrap;">
                      ${
                        model
                          ? `<span class="step-model-chip">${escapeHtml(
                              model
                            )}</span>`
                          : "<span></span>"
                      }
                      ${convLink}
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    }

    // 3. Subagent Descriptors (.system_generated/subagents/*.json)
    if (subagents.length > 0) {
      html += `
        <div class="swarm-section-card">
          <div style="font-size:0.75rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px;">
            Spawned Subagents (${subagents.length})
          </div>
          <div class="swarm-roster-grid">
            ${subagents
              .map((sa) => {
                const convId = sa.conversationId || "";
                const desc = sa.subagentDescriptor || {};
                const role = desc.role || desc.typeName || "Subagent";
                const typeName = desc.typeName || "";
                const saState = (sa.state || "").replace("SUBAGENT_STATE_", "");
                const stepIdx = sa.spawnStepIndex;
                const convLink = convId
                  ? `<a href="#${convId}" class="conv-link" data-conv-id="${convId}" title="Open subagent transcript (${escapeHtml(
                      convId
                    )})"><code>${escapeHtml(
                      convId.substring(0, 8)
                    )}</code><span class="jump-icon">↗</span></a>`
                  : "";
                return `
                  <div class="swarm-member-card">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                      <span style="font-weight:600; color:var(--text-primary);">🤖 ${escapeHtml(
                        role
                      )}</span>
                      ${
                        saState
                          ? `<span class="step-tokens-chip">${escapeHtml(
                              saState
                            )}</span>`
                          : ""
                      }
                    </div>
                    <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:8px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                      <span>${
                        typeName
                          ? `Type: <code>${escapeHtml(typeName)}</code>`
                          : ""
                      }${
                  typeof stepIdx === "number" ? ` · Step #${stepIdx}` : ""
                }</span>
                      ${convLink}
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    }

    // 4. Swarm Message Board (board.jsonl)
    if (board.length > 0) {
      html += `
        <div class="swarm-section-card">
          <div style="font-size:0.75rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px;">
            Swarm Message Board (${board.length} posts)
          </div>
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${board
              .map(
                (post) => `
              <div class="swarm-board-post">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                  <span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-secondary);">#${escapeHtml(
                    post.seq ?? ""
                  )}</span>
                  <span class="step-model-chip">@${escapeHtml(
                    post.agent || "agent"
                  )}</span>
                </div>
                <div class="markdown-body" style="font-size:0.86rem;">${renderMarkdown(
                  post.text || ""
                )}</div>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;

    if (!container.dataset.listenerAttached) {
      container.addEventListener("click", (e) => {
        const link = e.target.closest(".conv-link");
        if (link && link.dataset.convId) {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
            return;
          }
          e.preventDefault();
          const targetId = link.dataset.convId;
          if (typeof window.navigateToConversation === "function") {
            window.navigateToConversation(targetId, true);
          } else {
            window.location.hash = targetId;
          }
        }
      });
      container.dataset.listenerAttached = "true";
    }
  } catch (err) {
    container.innerHTML = `<div class="error-msg" style="color:var(--error); padding:24px;">Failed to load swarm view: ${escapeHtml(
      err.message
    )}</div>`;
  }
}
