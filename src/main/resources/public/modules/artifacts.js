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

export async function renderArtifactsView(container, conversationId, flavor) {
  container.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; height:200px; color:var(--text-secondary);">
      <div class="loading-state">Loading artifacts & snapshots...</div>
    </div>
  `;

  try {
    const [artifactsRes, snapshotsRes] = await Promise.all([
      fetch(
        `/api/brain/conversations/${conversationId}/artifacts?flavor=${encodeURIComponent(
          flavor
        )}`
      ),
      fetch(
        `/api/brain/conversations/${conversationId}/snapshots?flavor=${encodeURIComponent(
          flavor
        )}`
      ),
    ]);

    const artifacts = artifactsRes.ok ? await artifactsRes.json() : [];
    const snapshots = snapshotsRes.ok ? await snapshotsRes.json() : [];

    // Update counter badges in header if elements exist
    const artBadge = document.getElementById("artifacts-counter");
    if (artBadge) {
      artBadge.innerText =
        `${artifacts.length}` +
        (snapshots.length > 0 ? ` · ${snapshots.length} 🏷️` : "");
    }

    if (artifacts.length === 0 && snapshots.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="margin-top: 48px;">
          <div class="empty-icon">📦</div>
          <p>No artifacts (.md) or Git snapshot checkpoints found for this conversation.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="artifacts-layout" style="display:flex; gap:20px; height: 100%; min-height: 500px;">
        <!-- Left Sidebar: Artifacts & Snapshots List -->
        <div class="artifacts-sidebar" style="flex: 0 0 320px; display:flex; flex-direction:column; gap:16px; overflow-y:auto; padding-right:8px;">
          
          <!-- Artifacts Section -->
          <div>
            <div style="font-size:0.75rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between;">
              <span>Documents (${artifacts.length})</span>
            </div>
            <div id="artifacts-list" style="display:flex; flex-direction:column; gap:8px;">
              ${
                artifacts.length === 0
                  ? '<div style="font-size:0.8rem; color:var(--text-secondary); padding:8px;">No markdown documents</div>'
                  : ""
              }
              ${artifacts
                .map((art, idx) => {
                  const isPlan = art.filename.includes("plan");
                  const isWalkthrough = art.filename.includes("walkthrough");
                  const icon = isPlan ? "📋" : isWalkthrough ? "🚶" : "📄";
                  const sizeKb = (art.size / 1024).toFixed(1);
                  const version =
                    art.metadata?.version ||
                    (art.metadata?.Version ? art.metadata.Version : null);
                  const summary =
                    art.metadata?.Summary || art.metadata?.summary || "";

                  return `
                  <div class="artifact-item ${
                    idx === 0 ? "active" : ""
                  }" data-idx="${idx}" data-path="${escapeHtml(
                    art.path
                  )}" style="padding:10px 12px; background:rgba(30, 41, 59, 0.4); border:1px solid var(--border-color); border-radius:8px; cursor:pointer; transition:all 0.2s;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                      <div style="font-weight:600; font-size:0.85rem; color:var(--text-primary); display:flex; align-items:center; gap:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(
                        art.filename
                      )}">
                        <span>${icon}</span>
                        <span>${escapeHtml(art.filename)}</span>
                      </div>
                      ${
                        version
                          ? `<span style="font-size:0.65rem; background:rgba(139, 92, 246, 0.2); color:#a78bfa; padding:2px 6px; border-radius:10px; font-weight:700;">v${version}</span>`
                          : ""
                      }
                    </div>
                    <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px; display:flex; justify-content:space-between;">
                      <span>${sizeKb} KB</span>
                      <span>${formatTime(art.updatedAt, false)}</span>
                    </div>
                    ${
                      summary
                        ? `<div style="font-size:0.75rem; color:var(--text-secondary); opacity:0.85; margin-top:6px; line-height:1.3; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(
                            summary
                          )}</div>`
                        : ""
                    }
                  </div>
                `;
                })
                .join("")}
            </div>
          </div>

          <!-- Git Snapshots Section -->
          <div>
            <div style="font-size:0.75rem; font-weight:700; color:#f59e0b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between;">
              <span>Git Checkpoints (${snapshots.length})</span>
            </div>
            <div id="snapshots-list" style="display:flex; flex-direction:column; gap:8px;">
              ${
                snapshots.length === 0
                  ? '<div style="font-size:0.8rem; color:var(--text-secondary); padding:8px;">No git checkpoints</div>'
                  : ""
              }
              ${snapshots
                .map((snap) => {
                  const shortHash = snap.hash
                    ? snap.hash.substring(0, 7)
                    : "commit";
                  return `
                  <div class="snapshot-item" data-hash="${escapeHtml(
                    snap.hash
                  )}" style="padding:8px 12px; background:rgba(30, 41, 59, 0.4); border:1px solid var(--border-color); border-radius:8px; cursor:pointer; transition:all 0.2s;">
                    <div style="display:flex; align-items:center; justify-content:space-between;">
                      <span style="font-family:var(--font-mono); font-size:0.75rem; color:#f59e0b; font-weight:600;">🏷️ ${shortHash}</span>
                      <span style="font-size:0.7rem; color:var(--text-secondary);">${formatTime(
                        snap.date,
                        false
                      )}</span>
                    </div>
                    <div style="font-size:0.8rem; color:var(--text-primary); margin-top:4px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(
                      snap.message
                    )}">
                      ${escapeHtml(snap.message || "Snapshot")}
                    </div>
                  </div>
                `;
                })
                .join("")}
            </div>
          </div>
        </div>

        <!-- Right Content Area: Viewer -->
        <div class="artifacts-viewer" style="flex: 1; display:flex; flex-direction:column; background:rgba(15, 23, 42, 0.5); border:1px solid var(--border-color); border-radius:12px; overflow:hidden;">
          <div class="viewer-header" style="padding:12px 16px; background:rgba(30, 41, 59, 0.4); border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
            <div id="viewer-title" style="font-weight:600; font-size:0.95rem; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
              <span>Select an item to view</span>
            </div>
            <div id="viewer-actions" style="display:flex; gap:8px;">
              <button id="diff-mode-btn" class="btn secondary" style="padding:4px 10px; font-size:0.8rem; display:none;">☰ Unified</button>
              <button id="copy-artifact-btn" class="btn secondary" style="padding:4px 10px; font-size:0.8rem; display:none;">📋 Copy</button>
            </div>
          </div>
          <div id="viewer-body" style="flex:1; padding:20px; overflow-y:auto;">
            <div class="empty-state" style="margin-top:60px;">
              <p>Select a document or snapshot from the left panel.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    const viewerTitle = container.querySelector("#viewer-title");
    const viewerBody = container.querySelector("#viewer-body");
    const copyBtn = container.querySelector("#copy-artifact-btn");
    const diffModeBtn = container.querySelector("#diff-mode-btn");
    let currentRawContent = "";
    let currentDiffFormat = "side-by-side";
    let currentActiveSnapshot = null;

    if (diffModeBtn) {
      diffModeBtn.addEventListener("click", () => {
        currentDiffFormat =
          currentDiffFormat === "side-by-side"
            ? "line-by-line"
            : "side-by-side";
        diffModeBtn.innerText =
          currentDiffFormat === "side-by-side" ? "☰ Unified" : "⊞ Split";
        if (currentActiveSnapshot) {
          showSnapshot(currentActiveSnapshot);
        }
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        if (currentRawContent) {
          navigator.clipboard.writeText(currentRawContent);
          copyBtn.innerText = "✅ Copied!";
          setTimeout(() => (copyBtn.innerText = "📋 Copy"), 2000);
        }
      });
    }

    // Function to load and render an artifact
    async function showArtifact(art) {
      viewerTitle.innerHTML = `<span>📄 <strong>${escapeHtml(
        art.filename
      )}</strong></span> <span style="font-size:0.75rem; color:var(--text-secondary); margin-left:8px;">(${(
        art.size / 1024
      ).toFixed(1)} KB)</span>`;
      viewerBody.innerHTML = `<div class="loading-state">Loading ${escapeHtml(
        art.filename
      )}...</div>`;
      currentActiveSnapshot = null;
      if (diffModeBtn) diffModeBtn.style.display = "none";
      if (copyBtn) copyBtn.style.display = "none";

      try {
        const res = await fetch(
          `/api/brain/file?path=${encodeURIComponent(art.path)}`
        );
        if (!res.ok) throw new Error("Failed to load file");
        const mdText = await res.text();
        currentRawContent = mdText;
        if (copyBtn) copyBtn.style.display = "inline-block";

        let metaBanner = "";
        if (art.metadata) {
          const meta = art.metadata;
          const summary = meta.Summary || meta.summary;
          const version = meta.version || meta.Version;
          if (summary || version) {
            metaBanner = `
              <div style="margin-bottom: 16px; padding: 12px; background: rgba(59, 130, 246, 0.1); border-left: 3px solid #3b82f6; border-radius: 4px; font-size: 0.85rem;">
                ${
                  version
                    ? `<div><strong>Version:</strong> v${version}</div>`
                    : ""
                }
                ${
                  summary
                    ? `<div style="margin-top:4px; color:var(--text-secondary);"><strong>Summary:</strong> ${escapeHtml(
                        summary
                      )}</div>`
                    : ""
                }
              </div>
            `;
          }
        }

        viewerBody.innerHTML =
          metaBanner +
          `<div class="markdown-body">${renderMarkdown(mdText)}</div>`;
        viewerBody.querySelectorAll("pre code").forEach((el) => {
          hljs.highlightElement(el);
        });
      } catch (err) {
        viewerBody.innerHTML = `<div class="error-msg" style="color:var(--error); padding:16px;">Failed to load artifact: ${escapeHtml(
          err.message
        )}</div>`;
      }
    }

    // Function to load and render a snapshot diff
    async function showSnapshot(snap) {
      currentActiveSnapshot = snap;
      const shortHash = snap.hash.substring(0, 7);
      viewerTitle.innerHTML = `<span>🏷️ Snapshot <strong>${shortHash}</strong>: ${escapeHtml(
        snap.message
      )}</span>`;
      viewerBody.innerHTML = `<div class="loading-state">Loading snapshot diff...</div>`;
      if (diffModeBtn) {
        diffModeBtn.style.display = "inline-block";
        diffModeBtn.innerText =
          currentDiffFormat === "side-by-side" ? "☰ Unified" : "⊞ Split";
      }
      if (copyBtn) copyBtn.style.display = "none";

      try {
        const res = await fetch(
          `/api/brain/conversations/${conversationId}/diff?commit=${encodeURIComponent(
            snap.hash
          )}&flavor=${encodeURIComponent(flavor)}`
        );
        if (!res.ok) throw new Error("Failed to load git diff");
        const diffText = await res.text();
        currentRawContent = diffText;
        if (copyBtn) copyBtn.style.display = "inline-block";

        if (!diffText.trim()) {
          viewerBody.innerHTML = `<div class="empty-state"><p>No changes in this commit snapshot (Initial Commit or Empty).</p></div>`;
          return;
        }

        const diffContainer = document.createElement("div");
        diffContainer.id = "diff2html-container";
        diffContainer.className = "d2h-dark-color-scheme";
        viewerBody.innerHTML = "";
        viewerBody.appendChild(diffContainer);

        if (window.Diff2HtmlUI) {
          const diff2htmlUi = new Diff2HtmlUI(diffContainer, diffText, {
            drawFileList: true,
            matching: "lines",
            outputFormat: currentDiffFormat,
            highlight: true,
            renderNothingWhenEmpty: false,
            colorScheme: "dark",
          });
          diff2htmlUi.draw();
          diff2htmlUi.highlightCode();
        } else {
          // Fallback to code block if diff2html library fails to load
          viewerBody.innerHTML = `<pre class="code-block"><code class="language-diff">${escapeHtml(
            diffText
          )}</code></pre>`;
          viewerBody
            .querySelectorAll("pre code")
            .forEach((el) => hljs.highlightElement(el));
        }
      } catch (err) {
        viewerBody.innerHTML = `<div class="error-msg" style="color:var(--error); padding:16px;">Failed to load diff: ${escapeHtml(
          err.message
        )}</div>`;
      }
    }

    // Setup click handlers for artifacts
    container.querySelectorAll(".artifact-item").forEach((item) => {
      item.addEventListener("click", () => {
        container
          .querySelectorAll(".artifact-item, .snapshot-item")
          .forEach((el) => {
            el.style.borderColor = "var(--border-color)";
            el.style.background = "rgba(30, 41, 59, 0.4)";
          });
        item.style.borderColor = "var(--accent-blue)";
        item.style.background = "rgba(59, 130, 246, 0.15)";
        const idx = parseInt(item.dataset.idx, 10);
        if (artifacts[idx]) showArtifact(artifacts[idx]);
      });
    });

    // Setup click handlers for snapshots
    container.querySelectorAll(".snapshot-item").forEach((item) => {
      item.addEventListener("click", () => {
        container
          .querySelectorAll(".artifact-item, .snapshot-item")
          .forEach((el) => {
            el.style.borderColor = "var(--border-color)";
            el.style.background = "rgba(30, 41, 59, 0.4)";
          });
        item.style.borderColor = "#f59e0b";
        item.style.background = "rgba(245, 158, 11, 0.15)";
        const hash = item.dataset.hash;
        const snap = snapshots.find((s) => s.hash === hash);
        if (snap) showSnapshot(snap);
      });
    });

    // Automatically load the first artifact if available
    if (artifacts.length > 0) {
      const firstItem = container.querySelector('.artifact-item[data-idx="0"]');
      if (firstItem) {
        firstItem.style.borderColor = "var(--accent-blue)";
        firstItem.style.background = "rgba(59, 130, 246, 0.15)";
      }
      showArtifact(artifacts[0]);
    } else if (snapshots.length > 0) {
      const firstSnap = container.querySelector(".snapshot-item");
      if (firstSnap) {
        firstSnap.style.borderColor = "#f59e0b";
        firstSnap.style.background = "rgba(245, 158, 11, 0.15)";
      }
      showSnapshot(snapshots[0]);
    }
  } catch (err) {
    container.innerHTML = `<div class="error-msg" style="color:var(--error); padding:24px;">Failed to load artifacts view: ${escapeHtml(
      err.message
    )}</div>`;
  }
}
