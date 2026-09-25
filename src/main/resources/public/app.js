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
import { initChat, openDrawer, clearHistory } from "./modules/chat.js";
import { renderArtifactsView } from "./modules/artifacts.js";
import { renderMessagesView } from "./modules/messages.js";

let allConversations = [];
let sortDescending = true;
let sortCriteria = "time";
let viewMode = "all";
let nestSubagents = true;

document.addEventListener("DOMContentLoaded", async () => {
  initUI();
  initChat();

  // View Navigation Tabs
  const transcriptBtn = document.getElementById("tab-transcript-btn");
  const artifactsBtn = document.getElementById("tab-artifacts-btn");
  const messagesBtn = document.getElementById("tab-messages-btn");

  const transcriptView = document.getElementById("transcript-container");
  const timelineTrack = document.getElementById("timeline-track");
  const artifactsView = document.getElementById("artifacts-container");
  const messagesView = document.getElementById("messages-container");

  function switchView(activeBtn, viewToShow) {
    [transcriptBtn, artifactsBtn, messagesBtn].forEach((btn) => {
      if (btn) btn.classList.remove("active");
    });
    if (activeBtn) activeBtn.classList.add("active");

    [transcriptView, artifactsView, messagesView].forEach((view) => {
      if (view) view.classList.add("hidden");
    });
    if (timelineTrack) {
      timelineTrack.style.display =
        viewToShow === transcriptView ? "block" : "none";
    }
    if (viewToShow) viewToShow.classList.remove("hidden");
  }

  if (transcriptBtn) {
    transcriptBtn.addEventListener("click", () => {
      switchView(transcriptBtn, transcriptView);
    });
  }

  if (artifactsBtn) {
    artifactsBtn.addEventListener("click", () => {
      switchView(artifactsBtn, artifactsView);
      if (state.currentConversationId) {
        renderArtifactsView(
          artifactsView,
          state.currentConversationId,
          state.currentFlavor
        );
      }
    });
  }

  if (messagesBtn) {
    messagesBtn.addEventListener("click", () => {
      switchView(messagesBtn, messagesView);
      if (state.currentConversationId) {
        renderMessagesView(
          messagesView,
          state.currentConversationId,
          state.currentFlavor
        );
      }
    });
  }

  const analysisChatBtn = document.getElementById("analysis-chat-btn");
  if (analysisChatBtn) {
    analysisChatBtn.addEventListener("click", () => {
      openDrawer({
        type: "analysis",
        targetId: "summary",
        label: "Session Analysis",
      });
    });
  }

  const flavorSelect = document.getElementById("flavor-select");
  await loadFlavors(flavorSelect);
  state.currentFlavor = flavorSelect.value;

  const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");
  function toggleSidebar() {
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar || !sidebarToggleBtn) return;
    sidebar.classList.toggle("collapsed");

    const expandedIcon = sidebarToggleBtn.querySelector(
      ".sidebar-icon-expanded"
    );
    const collapsedIcon = sidebarToggleBtn.querySelector(
      ".sidebar-icon-collapsed"
    );

    if (sidebar.classList.contains("collapsed")) {
      expandedIcon.classList.add("hidden");
      collapsedIcon.classList.remove("hidden");
      sidebarToggleBtn.querySelector(".sidebar-chevron").style.transform =
        "rotate(180deg)";
    } else {
      expandedIcon.classList.remove("hidden");
      collapsedIcon.classList.add("hidden");
      sidebarToggleBtn.querySelector(".sidebar-chevron").style.transform =
        "rotate(0deg)";
    }
  }

  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener("click", toggleSidebar);
  }

  // Global hotkey Cmd+B or Ctrl+B to toggle sidebar
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
      e.preventDefault();
      toggleSidebar();
    }
  });

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
      document.documentElement.style.setProperty(
        "--sidebar-width",
        `${newWidth}px`
      );
    });

    document.addEventListener("mouseup", () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = "default";
        sidebar.style.transition =
          "margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
        resizer.classList.remove("resizing");
        document.body.style.userSelect = "";
      }
    });
  }

  loadConversations();

  flavorSelect.addEventListener("change", () => {
    localStorage.setItem("agy-flavor", flavorSelect.value);
    state.currentFlavor = flavorSelect.value;
    state.currentConversationId = null;
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
    const tabsContainer = document.getElementById("view-tabs-container");
    if (tabsContainer) tabsContainer.style.display = "none";
    switchView(transcriptBtn, transcriptView);
  });

  const projectFilterSelect = document.getElementById("project-filter-select");
  if (projectFilterSelect) {
    projectFilterSelect.addEventListener("change", () => {
      viewMode = projectFilterSelect.value;
      renderConversationsList();
    });
  }

  const nestSubagentsToggle = document.getElementById("nest-subagents-toggle");
  if (nestSubagentsToggle) {
    nestSubagentsToggle.addEventListener("change", () => {
      nestSubagents = nestSubagentsToggle.checked;
      renderConversationsList();
    });
  }

  const sortCriteriaSelect = document.getElementById("sort-criteria-select");
  if (sortCriteriaSelect) {
    sortCriteriaSelect.addEventListener("change", () => {
      sortCriteria = sortCriteriaSelect.value;
      renderConversationsList();
    });
  }

  function toggleAnalysis() {
    const summaryHeader = document.getElementById("ai-summary-header");
    const container = document.getElementById("ai-summary-container");
    if (!summaryHeader || !container || container.classList.contains("hidden"))
      return;
    const content = document.getElementById("ai-summary-content");
    const chevron = summaryHeader.querySelector(".chevron");
    content.classList.toggle("collapsed");
    if (content.classList.contains("collapsed")) {
      chevron.style.transform = "rotate(0deg)";
    } else {
      chevron.style.transform = "rotate(90deg)";
    }
  }

  const summaryHeader = document.getElementById("ai-summary-header");
  if (summaryHeader) {
    summaryHeader.addEventListener("click", toggleAnalysis);
  }

  // Global hotkey Cmd+Shift+A or Ctrl+Shift+A to toggle Conversation Analysis
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      toggleAnalysis();
    }
  });

  document
    .getElementById("summarize-btn")
    .addEventListener("click", async (e) => {
      e.stopPropagation();
      const sessionId =
        document.getElementById("current-session-id").dataset.id;
      if (!sessionId) return;
      triggerAnalysis(sessionId, true);
    });

  const refreshBtn = document.getElementById("refresh-conversations-btn");
  if (refreshBtn) {
    let refreshRot = 0;
    refreshBtn.addEventListener("click", () => {
      refreshRot += 180;
      refreshBtn.querySelector(
        "svg"
      ).style.transform = `rotate(${refreshRot}deg)`;
      loadConversations();
    });
  }

  const sortBtn = document.getElementById("sort-conversations-btn");
  if (sortBtn) {
    let sortRot = 0;
    sortBtn.addEventListener("click", () => {
      sortRot += 180;
      sortBtn.querySelector("svg").style.transform = `rotate(${sortRot}deg)`;
      sortDescending = !sortDescending;
      renderConversationsList();
    });
  }

  const searchInput = document.getElementById("conversation-search");
  const clearSearchBtn = document.getElementById("clear-search-btn");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      if (clearSearchBtn) {
        clearSearchBtn.style.display =
          searchInput.value.length > 0 ? "block" : "none";
      }
      renderConversationsList();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", () => {
      if (searchInput) {
        searchInput.value = "";
        clearSearchBtn.style.display = "none";
        renderConversationsList();
        searchInput.focus();
      }
    });
  }

  window.navigateToConversation = navigateToConversation;

  window.addEventListener("hashchange", () => {
    const hashId = window.location.hash.substring(1);
    if (hashId && hashId !== state.currentConversationId) {
      navigateToConversation(hashId, false);
    }
  });

  // Support conversation:// links anywhere in the page (e.g. within markdown/chat)
  document.addEventListener("click", (e) => {
    const convSchemeLink = e.target.closest('a[href^="conversation://"]');
    if (convSchemeLink) {
      e.preventDefault();
      const targetId = convSchemeLink
        .getAttribute("href")
        .replace("conversation://", "")
        .trim();
      if (targetId) {
        navigateToConversation(targetId, true);
      }
    }
  });
});

async function loadFlavors(selectElement) {
  try {
    const res = await fetch(`/api/brain/flavors`);
    const flavors = await res.json();
    selectElement.innerHTML = "";

    const priority = {
      antigravity: 1,
      "antigravity-cli": 2,
      "antigravity-ide": 3,
      jetski: 4,
    };
    flavors.sort((a, b) => (priority[a] || 99) - (priority[b] || 99));

    const FLAVOR_LABELS = {
      antigravity: "Antigravity 2.0 (Desktop)",
      "antigravity-cli": "Antigravity CLI (agy)",
      "antigravity-ide": "Antigravity IDE",
      jetski: "Jetski",
    };

    flavors.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.text = FLAVOR_LABELS[f] || f;
      selectElement.appendChild(opt);
    });

    const savedFlavor = localStorage.getItem("agy-flavor");
    if (savedFlavor && flavors.includes(savedFlavor)) {
      selectElement.value = savedFlavor;
    } else if (flavors.includes("antigravity")) {
      selectElement.value = "antigravity";
    }
  } catch (e) {
    console.error("Failed to load flavors", e);
  }
}

function getProjectKey(conv) {
  if (conv.projectName && conv.projectName.trim() !== "") {
    return conv.projectName.trim();
  }
  if (conv.workspaceUri && conv.workspaceUri.trim() !== "") {
    const parts = conv.workspaceUri.split(/[/\\]/);
    return parts[parts.length - 1] || conv.workspaceUri.trim();
  }
  return "General / No Project";
}

function formatRelativeTime(timestamp) {
  if (!timestamp || timestamp <= 0) return "Unknown time";
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHour = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDay > 0) return diffDay === 1 ? "1d ago" : `${diffDay}d ago`;
  if (diffHour > 0) return diffHour === 1 ? "1h ago" : `${diffHour}h ago`;
  if (diffMin > 0) return diffMin === 1 ? "1m ago" : `${diffMin}m ago`;
  return "just now";
}

function getStatusInfo(status) {
  if (!status) return { className: "status-idle", label: "Idle / Done" };
  const s = status.toUpperCase();
  if (s.includes("RUNNING")) {
    return { className: "status-running", label: "Running" };
  }
  if (s.includes("ERROR") || s.includes("FAILED") || s.includes("KILLED")) {
    return { className: "status-error", label: "Error / Killed" };
  }
  return { className: "status-idle", label: "Idle / Done" };
}

function updateProjectFilterDropdown() {
  const projectSelect = document.getElementById("project-filter-select");
  if (!projectSelect) return;

  const currentVal = projectSelect.value;
  const projectMap = new Map();

  allConversations.forEach((c) => {
    const key = getProjectKey(c);
    if (key !== "General / No Project") {
      if (!projectMap.has(key)) {
        projectMap.set(key, c.workspaceUri || "");
      }
    }
  });

  const sortedProjects = Array.from(projectMap.keys()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  projectSelect.innerHTML = `
    <option value="all">📁 All Projects (Timeline)</option>
    <option value="__grouped__">📂 Group by Project</option>
  `;

  if (sortedProjects.length > 0) {
    const optGroup = document.createElement("optgroup");
    optGroup.label = "Filter by Project";
    sortedProjects.forEach((proj) => {
      const opt = document.createElement("option");
      opt.value = proj;
      opt.textContent = `📦 ${proj}`;
      const uri = projectMap.get(proj);
      if (uri) opt.title = uri;
      optGroup.appendChild(opt);
    });
    projectSelect.appendChild(optGroup);
  }

  if (Array.from(projectSelect.options).some((o) => o.value === currentVal)) {
    projectSelect.value = currentVal;
    viewMode = currentVal;
  } else {
    projectSelect.value = "all";
    viewMode = "all";
  }
}

async function loadConversations() {
  const list = document.getElementById("conversations-list");
  const flavor = encodeURIComponent(
    document.getElementById("flavor-select").value
  );
  try {
    const res = await fetch(`/api/brain/conversations?flavor=${flavor}`);
    allConversations = await res.json();
    updateProjectFilterDropdown();
    renderConversationsList();

    const initialHash = window.location.hash.substring(1);
    if (initialHash && !state.currentConversationId) {
      navigateToConversation(initialHash, false);
    }
  } catch (e) {
    list.innerHTML =
      '<div class="loading-state" style="padding:16px;">Error loading sessions. Is the backend running?</div>';
  }
}

function sortConversations(list) {
  return [...list].sort((a, b) => {
    let diff = 0;
    if (sortCriteria === "steps") {
      diff = (b.stepCount || 0) - (a.stepCount || 0);
    } else {
      const aTime = parseInt(a.updatedAt || 0, 10);
      const bTime = parseInt(b.updatedAt || 0, 10);
      diff = bTime - aTime;
    }
    return sortDescending ? diff : -diff;
  });
}

function createConvItemElement(conv, isNestedChild = false) {
  const div = document.createElement("div");
  div.className = `conv-item ${isNestedChild ? "is-subagent" : ""}`;
  div.dataset.id = conv.id;
  div.dataset.summary = conv.summary;
  div.dataset.preview = conv.preview || "";
  div.dataset.updatedAt = conv.updatedAt || "0";
  div.dataset.stepCount = conv.stepCount || 0;
  div.dataset.status = conv.status || "";
  div.dataset.workspaceUri = conv.workspaceUri || "";
  div.dataset.agentName = conv.agentName || "";
  div.dataset.parentConversationId = conv.parentConversationId || "";
  div.dataset.isSubagent = conv.isSubagent ? "true" : "false";
  div.dataset.projectId = conv.projectId || "";
  div.dataset.projectName = conv.projectName || "";

  const statusInfo = getStatusInfo(conv.status);
  const timeRel = formatRelativeTime(parseInt(conv.updatedAt, 10));

  let subagentTag = "";
  if (conv.agentName) {
    subagentTag = `<span class="conv-subagent-tag">${escapeHtml(
      conv.agentName
    )}</span>`;
  }

  let projectTag = "";
  const projKey = getProjectKey(conv);
  if (projKey && projKey !== "General / No Project") {
    projectTag = `<span class="conv-project-tag" title="Project: ${escapeHtml(
      projKey
    )}">📦 ${escapeHtml(projKey)}</span>`;
  }

  let stepsBadge = "";
  if (conv.stepCount > 0) {
    stepsBadge = `<span class="conv-steps-badge">${conv.stepCount} steps</span>`;
  }

  div.innerHTML = `
    <div class="conv-title-row">
      <span class="conv-status-dot ${statusInfo.className}" title="${
    statusInfo.label
  }"></span>
      <span class="conv-title-text" title="${escapeHtml(
        conv.summary
      )}">${escapeHtml(conv.summary)}</span>
      ${stepsBadge}
    </div>
    <div class="conv-meta-row">
      <span>${timeRel}</span>
      ${projectTag}
      ${subagentTag}
      <span class="conv-hash-id">${conv.id.substring(0, 8)}</span>
    </div>
  `;

  return div;
}

function renderConversationTree(container, items, nestEnabled) {
  if (!nestEnabled) {
    items.forEach((conv) => {
      container.appendChild(createConvItemElement(conv, false));
    });
    return;
  }

  // Build parent-to-children relationship
  const itemMap = new Map();
  items.forEach((c) => itemMap.set(c.id, c));

  const childrenMap = new Map();
  const topLevel = [];

  items.forEach((c) => {
    if (c.parentConversationId && itemMap.has(c.parentConversationId)) {
      if (!childrenMap.has(c.parentConversationId)) {
        childrenMap.set(c.parentConversationId, []);
      }
      childrenMap.get(c.parentConversationId).push(c);
    } else {
      topLevel.push(c);
    }
  });

  topLevel.forEach((parent) => {
    container.appendChild(createConvItemElement(parent, false));

    const children = childrenMap.get(parent.id);
    if (children && children.length > 0) {
      const wrapper = document.createElement("div");
      wrapper.className = "subagents-wrapper";

      const toggleBtn = document.createElement("button");
      toggleBtn.className = "subagents-toggle-btn";
      toggleBtn.dataset.count = children.length;
      toggleBtn.innerHTML = `▼ ${children.length} subagent${
        children.length > 1 ? "s" : ""
      }`;
      wrapper.appendChild(toggleBtn);

      const childrenContainer = document.createElement("div");
      childrenContainer.className = "subagents-children-container";
      childrenContainer.style.display = "flex";
      childrenContainer.style.flexDirection = "column";
      childrenContainer.style.gap = "6px";

      children.forEach((child) => {
        childrenContainer.appendChild(createConvItemElement(child, true));
      });

      wrapper.appendChild(childrenContainer);
      container.appendChild(wrapper);
    }
  });
}

function renderConversationsList() {
  const list = document.getElementById("conversations-list");
  list.innerHTML = "";

  let filtered = [...allConversations];
  const searchTerm =
    document.getElementById("conversation-search")?.value.toLowerCase() || "";

  if (searchTerm) {
    filtered = filtered.filter(
      (c) =>
        (c.summary && c.summary.toLowerCase().includes(searchTerm)) ||
        (c.id && c.id.toLowerCase().includes(searchTerm)) ||
        (c.projectName && c.projectName.toLowerCase().includes(searchTerm)) ||
        (c.workspaceUri && c.workspaceUri.toLowerCase().includes(searchTerm)) ||
        (c.agentName && c.agentName.toLowerCase().includes(searchTerm))
    );
  }

  // Handle specific project filtering
  if (viewMode !== "all" && viewMode !== "__grouped__") {
    filtered = filtered.filter((c) => getProjectKey(c) === viewMode);
  }

  if (filtered.length === 0) {
    list.innerHTML = '<div class="loading-state">No sessions found</div>';
    return;
  }

  if (viewMode === "__grouped__") {
    // Group by project
    const groups = new Map();
    filtered.forEach((c) => {
      const projKey = getProjectKey(c);
      if (!groups.has(projKey)) {
        groups.set(projKey, []);
      }
      groups.get(projKey).push(c);
    });

    const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === "General / No Project") return 1;
      if (b[0] === "General / No Project") return -1;
      return a[0].localeCompare(b[0], undefined, { sensitivity: "base" });
    });

    sortedGroups.forEach(([projName, groupItems]) => {
      const groupEl = document.createElement("div");
      groupEl.className = "project-group";

      const sampleItem = groupItems.find((i) => i.workspaceUri);
      const titleAttr = sampleItem ? sampleItem.workspaceUri : projName;

      const headerEl = document.createElement("div");
      headerEl.className = "project-group-header";
      headerEl.title = titleAttr;
      headerEl.innerHTML = `
        <div class="project-group-title">
          <span>📂</span>
          <span style="font-weight:600;">${escapeHtml(projName)}</span>
          <span class="project-group-count">${groupItems.length}</span>
        </div>
        <svg class="project-group-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      `;

      const itemsContainer = document.createElement("div");
      itemsContainer.className = "project-group-items";

      const sortedGroupItems = sortConversations(groupItems);
      renderConversationTree(itemsContainer, sortedGroupItems, nestSubagents);

      groupEl.appendChild(headerEl);
      groupEl.appendChild(itemsContainer);
      list.appendChild(groupEl);
    });
  } else {
    // Flat timeline or single filtered project
    const sorted = sortConversations(filtered);
    renderConversationTree(list, sorted, nestSubagents);
  }

  // Event Delegation for conversation selection & toggles
  if (!list.dataset.listenerAttached) {
    list.addEventListener("click", (e) => {
      // Check subagents toggle button
      const toggleBtn = e.target.closest(".subagents-toggle-btn");
      if (toggleBtn) {
        e.stopPropagation();
        const wrapper = toggleBtn.closest(".subagents-wrapper");
        if (wrapper) {
          const childrenContainer = wrapper.querySelector(
            ".subagents-children-container"
          );
          if (childrenContainer) {
            const isHidden = childrenContainer.style.display === "none";
            childrenContainer.style.display = isHidden ? "flex" : "none";
            toggleBtn.innerHTML = isHidden
              ? `▼ ${toggleBtn.dataset.count} subagent${
                  toggleBtn.dataset.count > 1 ? "s" : ""
                }`
              : `▶ ${toggleBtn.dataset.count} subagent${
                  toggleBtn.dataset.count > 1 ? "s" : ""
                }`;
          }
        }
        return;
      }

      // Check project group header toggle
      const groupHeader = e.target.closest(".project-group-header");
      if (groupHeader) {
        e.stopPropagation();
        const group = groupHeader.closest(".project-group");
        if (group) {
          const itemsContainer = group.querySelector(".project-group-items");
          const chevron = group.querySelector(".project-group-chevron");
          if (itemsContainer) {
            itemsContainer.classList.toggle("collapsed");
            if (chevron) chevron.classList.toggle("collapsed");
          }
        }
        return;
      }

      const item = e.target.closest(".conv-item");
      if (item && item.dataset.id) {
        selectConversation(item.dataset.id, item);
      }
    });

    // Custom Popover Logic
    const popover = document.getElementById("conv-popover");
    list.addEventListener("mouseover", (e) => {
      const item = e.target.closest(".conv-item");
      if (item && item.dataset.id && popover) {
        document.getElementById("popover-title").innerText =
          item.dataset.summary;
        document.getElementById("popover-id").innerText = item.dataset.id;

        const timestamp = parseInt(item.dataset.updatedAt, 10);
        let timeStr = "Unknown time";
        if (timestamp > 0) {
          const d = new Date(timestamp);
          const dateText = d.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          const rel = formatRelativeTime(timestamp);
          timeStr = `${dateText} (${rel})`;
        }
        document.getElementById("popover-time").innerText = timeStr;

        const statusInfo = getStatusInfo(item.dataset.status);
        const statusBadge = document.getElementById("popover-status-badge");
        if (statusBadge) {
          statusBadge.innerHTML = `<span class="conv-status-dot ${statusInfo.className}"></span> ${statusInfo.label}`;
        }

        const stepsBadge = document.getElementById("popover-steps-badge");
        if (stepsBadge) {
          const stepCount = parseInt(item.dataset.stepCount, 10) || 0;
          stepsBadge.innerText = `${stepCount} steps`;
        }

        const projectRow = document.getElementById("popover-project-row");
        const projectEl = document.getElementById("popover-project");
        if (projectRow && projectEl) {
          const ws = item.dataset.workspaceUri;
          const projName = item.dataset.projectName;
          if (projName && ws) {
            projectEl.innerText = `${projName} (${ws})`;
            projectRow.style.display = "block";
          } else if (projName) {
            projectEl.innerText = projName;
            projectRow.style.display = "block";
          } else if (ws && ws.trim()) {
            projectEl.innerText = ws;
            projectRow.style.display = "block";
          } else {
            projectRow.style.display = "none";
          }
        }

        const subagentRow = document.getElementById("popover-subagent-row");
        const subagentEl = document.getElementById("popover-subagent");
        if (subagentRow && subagentEl) {
          if (item.dataset.isSubagent === "true") {
            const agentName = item.dataset.agentName || "agent";
            const parentId = item.dataset.parentConversationId || "";
            subagentEl.innerText = `Subagent: ${agentName}${
              parentId ? ` (Parent: ${parentId.substring(0, 8)})` : ""
            }`;
            subagentRow.style.display = "block";
          } else {
            subagentRow.style.display = "none";
          }
        }

        popover.classList.remove("hidden");
      }
    });

    list.addEventListener("mousemove", (e) => {
      const item = e.target.closest(".conv-item");
      if (item && popover && !popover.classList.contains("hidden")) {
        let top = e.clientY + 15;
        let left = e.clientX + 15;

        if (top + popover.offsetHeight > window.innerHeight) {
          top = e.clientY - popover.offsetHeight - 15;
        }
        if (left + popover.offsetWidth > window.innerWidth) {
          left = e.clientX - popover.offsetWidth - 15;
        }

        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;
      }
    });

    list.addEventListener("mouseout", (e) => {
      const item = e.target.closest(".conv-item");
      if (item && popover) {
        if (e.relatedTarget && item.contains(e.relatedTarget)) return;
        popover.classList.add("hidden");
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
  } else if (hashId) {
    selectConversation(hashId, null);
  }
}

export function navigateToConversation(id, switchTab = true) {
  if (!id) return;

  if (switchTab) {
    const transcriptBtn = document.getElementById("tab-transcript-btn");
    if (transcriptBtn) {
      transcriptBtn.click();
    }
  }

  let item = document.querySelector(`.conv-item[data-id="${id}"]`);

  // If the conversation is not rendered, it may be hidden by search filter
  if (!item) {
    const searchInput = document.getElementById("conversation-search");
    const clearSearchBtn = document.getElementById("clear-search-btn");
    if (searchInput && searchInput.value) {
      searchInput.value = "";
      if (clearSearchBtn) clearSearchBtn.style.display = "none";
      renderConversationsList();
      item = document.querySelector(`.conv-item[data-id="${id}"]`);
    }
  }

  if (item) {
    item.scrollIntoView({ block: "nearest", behavior: "smooth" });
    selectConversation(id, item);
  } else {
    selectConversation(id, null);
  }
}

async function selectConversation(id, element) {
  state.currentConversationId = id;
  state.currentFlavor =
    document.getElementById("flavor-select")?.value || "antigravity-cli";

  clearHistory();

  document
    .querySelectorAll(".conv-item")
    .forEach((el) => el.classList.remove("active"));

  let targetElement = element;
  if (!targetElement) {
    targetElement = document.querySelector(`.conv-item[data-id="${id}"]`);
  }
  if (targetElement) {
    targetElement.classList.add("active");
  }

  // Update URL hash
  if (window.location.hash !== `#${id}`) {
    window.location.hash = id;
  }

  const title = document.getElementById("current-session-title");
  const conv = allConversations.find((c) => c.id === id);
  if (conv && conv.summary) {
    title.innerText = conv.summary;
  } else if (targetElement) {
    title.innerText =
      targetElement.dataset.summary ||
      targetElement.querySelector(".conv-title-text")?.innerText ||
      id;
  } else {
    title.innerText = id;
  }

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

    // Show view navigation tabs
    const tabsContainer = document.getElementById("view-tabs-container");
    if (tabsContainer) {
      tabsContainer.style.display = "flex";
    }

    // Refresh artifacts & messages counters
    fetch(`/api/brain/conversations/${id}/artifacts?flavor=${flavor}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((arts) => {
        const badge = document.getElementById("artifacts-counter");
        if (badge) badge.innerText = `${arts.length}`;
      })
      .catch(() => {});

    fetch(`/api/brain/conversations/${id}/messages?flavor=${flavor}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((msgs) => {
        const badge = document.getElementById("messages-counter");
        if (badge) badge.innerText = `${msgs.length}`;
      })
      .catch(() => {});

    // If currently on artifacts or messages tab, render immediately
    const currentTab = document.querySelector(".view-tab-btn.active")?.id;
    if (currentTab === "tab-artifacts-btn") {
      const artContainer = document.getElementById("artifacts-container");
      renderArtifactsView(artContainer, id, state.currentFlavor);
    } else if (currentTab === "tab-messages-btn") {
      const msgContainer = document.getElementById("messages-container");
      renderMessagesView(msgContainer, id, state.currentFlavor);
    }
  } catch (e) {
    container.innerHTML =
      '<div class="loading-state" style="text-align:center; color:red;">Failed to load transcript.</div>';
  }
}
