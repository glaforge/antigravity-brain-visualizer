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
import { state, escapeHtml, renderMarkdown } from "./utils.js";

let activeContext = { type: "global", targetId: "", label: "Global Session" };

export function initChat() {
  const drawer = document.getElementById("chat-drawer");
  const toggleBtn = document.getElementById("chat-toggle-btn");
  const closeBtn = document.getElementById("chat-close-btn");
  const sendBtn = document.getElementById("chat-send-btn");
  const input = document.getElementById("chat-input");
  const clearContextBtn = document.getElementById("chat-clear-context-btn");

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => toggleDrawer());
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => closeDrawer());
  }

  if (sendBtn && input) {
    sendBtn.addEventListener("click", () => handleSend());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });
  }

  const clearHistoryBtn = document.getElementById("chat-clear-history-btn");
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", () => clearHistory());
  }

  if (clearContextBtn) {
    clearContextBtn.addEventListener("click", () => resetContext());
  }

  // Quick preset buttons
  document.querySelectorAll(".chat-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prompt = btn.dataset.prompt;
      if (prompt && input) {
        input.value = prompt;
        handleSend();
      }
    });
  });

  // Global hotkey Cmd+K or Ctrl+K to toggle chat
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      toggleDrawer();
    }
  });
}

export function openDrawer(contextObj = null) {
  const drawer = document.getElementById("chat-drawer");
  if (!drawer) return;
  drawer.classList.remove("collapsed");

  if (contextObj) {
    setContext(contextObj.type, contextObj.targetId, contextObj.label);
  }

  const input = document.getElementById("chat-input");
  if (input) input.focus();
}

export function closeDrawer() {
  const drawer = document.getElementById("chat-drawer");
  if (drawer) drawer.classList.add("collapsed");
}

export function toggleDrawer() {
  const drawer = document.getElementById("chat-drawer");
  if (!drawer) return;
  if (drawer.classList.contains("collapsed")) {
    openDrawer();
  } else {
    closeDrawer();
  }
}

export function setContext(type, targetId = "", label = "Global Session") {
  activeContext = { type, targetId, label };
  const chipContainer = document.getElementById("chat-context-chip-container");
  const chipLabel = document.getElementById("chat-context-label");

  if (chipContainer && chipLabel) {
    if (type === "global") {
      chipContainer.style.display = "none";
    } else {
      chipContainer.style.display = "inline-flex";
      chipLabel.textContent = label;
    }
  }
}

export function resetContext() {
  setContext("global", "", "Global Session");
}

export function clearHistory() {
  const messagesContainer = document.getElementById("chat-messages");
  if (!messagesContainer) return;
  messagesContainer.innerHTML = `
    <div class="chat-message assistant">
      <div class="chat-message-content">
        Hello! I am your Antigravity Session Assistant. Ask me anything about this session, specific sequences, step failures, or ask me to draft custom skills!
      </div>
    </div>
  `;
  resetContext();
}

async function handleSend() {
  const input = document.getElementById("chat-input");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const conversationId =
    state.currentConversationId ||
    document.getElementById("current-session-id")?.innerText?.trim();

  if (!conversationId) {
    appendMessage(
      "assistant",
      "⚠️ Please select a session from the sidebar first."
    );
    return;
  }

  input.value = "";
  input.style.height = "auto";

  // Append user message
  appendMessage("user", text);

  // Append loading indicator
  const loadingId = "chat-loading-" + Date.now();
  appendLoading(loadingId);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flavor:
          state.currentFlavor ||
          document.getElementById("flavor-select")?.value ||
          "antigravity-cli",
        conversationId: conversationId,
        scope: {
          type: activeContext.type,
          targetId: activeContext.targetId,
        },
        message: text,
      }),
    });

    const data = await response.json();
    removeLoading(loadingId);

    if (data.answer) {
      appendMessage("assistant", data.answer);
    } else {
      appendMessage("assistant", "Sorry, I was unable to generate a response.");
    }
  } catch (err) {
    removeLoading(loadingId);
    appendMessage("assistant", `❌ Error contacting assistant: ${err.message}`);
  }
}

function appendMessage(role, text) {
  const messagesContainer = document.getElementById("chat-messages");
  if (!messagesContainer) return;

  const msgDiv = document.createElement("div");
  msgDiv.className = `chat-message ${role}`;

  const contentDiv = document.createElement("div");
  contentDiv.className = "chat-message-content markdown-body";

  if (role === "assistant") {
    // Parse Markdown
    let html = renderMarkdown(text);
    contentDiv.innerHTML = html;

    // Apply syntax highlighting & enhance code blocks with copy/skill buttons
    contentDiv.querySelectorAll("pre code").forEach((codeBlock) => {
      if (window.hljs) {
        try {
          window.hljs.highlightElement(codeBlock);
        } catch (e) {
          console.warn("Highlight.js failed on block", e);
        }
      }
      const parent = codeBlock.parentElement;
      const copyBtn = document.createElement("button");
      copyBtn.className = "chat-copy-code-btn";
      const isSkill =
        codeBlock.textContent.includes("name:") ||
        codeBlock.textContent.includes("description:") ||
        codeBlock.textContent.includes("SKILL");

      copyBtn.innerHTML = isSkill ? `📋 Copy Skill Template` : `📋 Copy Code`;

      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(codeBlock.textContent);
        copyBtn.innerHTML = `✅ Copied!`;
        setTimeout(() => {
          copyBtn.innerHTML = isSkill
            ? `📋 Copy Skill Template`
            : `📋 Copy Code`;
        }, 2000);
      });
      parent.style.position = "relative";
      parent.appendChild(copyBtn);
    });
  } else {
    contentDiv.textContent = text;
  }

  msgDiv.appendChild(contentDiv);
  messagesContainer.appendChild(msgDiv);

  // Auto scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendLoading(id) {
  const messagesContainer = document.getElementById("chat-messages");
  if (!messagesContainer) return;

  const msgDiv = document.createElement("div");
  msgDiv.className = "chat-message assistant loading";
  msgDiv.id = id;
  msgDiv.innerHTML = `
    <div class="chat-message-content" style="display:flex; align-items:center; gap:8px;">
      <span class="chat-spinner">✨</span> Thinking...
    </div>
  `;
  messagesContainer.appendChild(msgDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function removeLoading(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}
