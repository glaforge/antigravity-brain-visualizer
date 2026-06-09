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
import { state, escapeHtml } from "./modules/utils.js";
import { renderTranscript } from "./modules/timeline.js";
import { renderStats } from "./modules/stats.js";
import { triggerAnalysis } from "./modules/analysis.js";
import { initUI } from "./modules/ui.js";

document.addEventListener("DOMContentLoaded", () => {
  initUI();

  const flavorSelect = document.getElementById("flavor-select");
  const savedFlavor = localStorage.getItem("agy-flavor");
  if (savedFlavor) {
    flavorSelect.value = savedFlavor;
  }

  const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");
  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener("click", () => {
      const sidebar = document.querySelector(".sidebar");
      sidebar.classList.toggle("collapsed");
      
      const expandedIcon = sidebarToggleBtn.querySelector(".sidebar-icon-expanded");
      const collapsedIcon = sidebarToggleBtn.querySelector(".sidebar-icon-collapsed");
      
      if (sidebar.classList.contains("collapsed")) {
        expandedIcon.classList.add("hidden");
        collapsedIcon.classList.remove("hidden");
        sidebarToggleBtn.querySelector(".sidebar-chevron").style.transform = "rotate(180deg)";
      } else {
        expandedIcon.classList.remove("hidden");
        collapsedIcon.classList.add("hidden");
        sidebarToggleBtn.querySelector(".sidebar-chevron").style.transform = "rotate(0deg)";
      }
    });
  }

  const resizer = document.getElementById("sidebar-resizer");
  const sidebar = document.querySelector(".sidebar");
  if (resizer && sidebar) {
    let isResizing = false;

    resizer.addEventListener("mousedown", (e) => {
      isResizing = true;
      document.body.style.cursor = "col-resize";
      sidebar.style.transition = "none";
      resizer.classList.add("resizing");
      // Prevent text selection while dragging
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      let newWidth = e.clientX;
      if (newWidth < 200) newWidth = 200;
      if (newWidth > 800) newWidth = 800;
      document.documentElement.style.setProperty("--sidebar-width", `${newWidth}px`);
    });

    document.addEventListener("mouseup", () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = "default";
        sidebar.style.transition = "margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
        resizer.classList.remove("resizing");
        document.body.style.userSelect = "";
      }
    });
  }

  loadConversations();

  flavorSelect.addEventListener("change", () => {
    localStorage.setItem("agy-flavor", flavorSelect.value);
    loadConversations();
    document.getElementById("transcript-container").innerHTML =
      '<div class="empty-state">Select a session from the sidebar to view its transcript.</div>';
    const statsContainer = document.getElementById("session-stats-container");
    if (statsContainer) statsContainer.innerHTML = "";
    document.getElementById("current-session-title").innerText =
      "Select a session";
    document.getElementById("current-session-id").innerText = "";
    document.getElementById("summarize-btn").disabled = true;
    document.getElementById("ai-summary-container").classList.add("hidden");
  });

  const summaryHeader = document.getElementById("ai-summary-header");
  if (summaryHeader) {
    summaryHeader.addEventListener("click", () => {
      const content = document.getElementById("ai-summary-content");
      const chevron = summaryHeader.querySelector(".chevron");
      content.classList.toggle("collapsed");
      if (content.classList.contains("collapsed")) {
        chevron.style.transform = "rotate(0deg)";
      } else {
        chevron.style.transform = "rotate(90deg)";
      }
    });
  }

  document
    .getElementById("summarize-btn")
    .addEventListener("click", async (e) => {
      e.stopPropagation();
      const sessionId =
        document.getElementById("current-session-id").dataset.id;
      if (!sessionId) return;
      triggerAnalysis(sessionId, true);
    });
});

async function loadConversations() {
  const list = document.getElementById("conversations-list");
  const flavor = encodeURIComponent(
    document.getElementById("flavor-select").value
  );
  try {
    const res = await fetch(`/api/brain/conversations?flavor=${flavor}`);
    const conversations = await res.json();

    list.innerHTML = "";
    if (conversations.length === 0) {
      list.innerHTML = '<div class="loading-state">No sessions found</div>';
      return;
    }

    conversations.forEach((conv) => {
      const div = document.createElement("div");
      div.className = "conv-item";
      div.dataset.id = conv.id;
      div.innerHTML = `<div class="conv-id" title="${conv.id}">${escapeHtml(
        conv.summary
      )}</div>`;
      list.appendChild(div);
    });

    // Event Delegation for conversation selection
    if (!list.dataset.listenerAttached) {
      list.addEventListener("click", (e) => {
        const item = e.target.closest(".conv-item");
        if (item && item.dataset.id) {
          selectConversation(item.dataset.id, item);
        }
      });
      list.dataset.listenerAttached = "true";
    }

    // Check if there's a session ID in the URL hash
    const hashId = window.location.hash.substring(1);
    const targetDiv = hashId
      ? list.querySelector(`[data-id="${hashId}"]`)
      : list.firstElementChild;

    if (targetDiv) {
      targetDiv.click();
    }
  } catch (e) {
    list.innerHTML =
      '<div class="loading-state" style="padding:16px;">Error loading sessions. Is the backend running?</div>';
  }
}

async function selectConversation(id, element) {
  document
    .querySelectorAll(".conv-item")
    .forEach((el) => el.classList.remove("active"));
  element.classList.add("active");

  // Update URL hash
  window.location.hash = id;

  const title = document.getElementById("current-session-title");
  title.innerText = element.querySelector(".conv-id").innerText;

  const subtitle = document.getElementById("current-session-id");
  subtitle.innerText = id;
  subtitle.dataset.id = id;

  document.getElementById("summarize-btn").disabled = false;

  // Auto trigger analysis
  triggerAnalysis(id, false);

  const container = document.getElementById("transcript-container");
  container.innerHTML =
    '<div class="loading-state" style="text-align:center; padding: 40px; color:#94a3b8;">Loading transcript...</div>';

  try {
    const flavor = encodeURIComponent(
      document.getElementById("flavor-select").value
    );
    const response = await fetch(
      `/api/brain/conversations/${id}/transcript?flavor=${flavor}`
    );
    const steps = await response.json();

    state.spansMultipleDays = false;
    if (
      steps &&
      steps.length > 0 &&
      steps[0].created_at &&
      steps[steps.length - 1].created_at
    ) {
      const firstDateStr = new Date(steps[0].created_at).toLocaleDateString();
      const lastDateStr = new Date(
        steps[steps.length - 1].created_at
      ).toLocaleDateString();
      if (firstDateStr !== lastDateStr) {
        state.spansMultipleDays = true;
      }
    }

    renderTranscript(steps, container);
    renderStats(steps);
  } catch (e) {
    container.innerHTML =
      '<div class="loading-state" style="text-align:center; color:red;">Failed to load transcript.</div>';
  }
}
