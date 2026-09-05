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
import { state, escapeHtml, syntaxHighlight, formatTime } from "./utils.js";
import { openDrawer } from "./chat.js";

const STANDARD_HTML_TAGS = new Set([
  "a",
  "abbr",
  "address",
  "area",
  "article",
  "aside",
  "audio",
  "b",
  "base",
  "bdi",
  "bdo",
  "blockquote",
  "body",
  "br",
  "button",
  "canvas",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "data",
  "datalist",
  "dd",
  "del",
  "details",
  "dfn",
  "dialog",
  "div",
  "dl",
  "dt",
  "em",
  "embed",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hgroup",
  "hr",
  "html",
  "i",
  "iframe",
  "img",
  "input",
  "ins",
  "kbd",
  "label",
  "legend",
  "li",
  "link",
  "main",
  "map",
  "mark",
  "menu",
  "meta",
  "meter",
  "nav",
  "noscript",
  "object",
  "ol",
  "optgroup",
  "option",
  "output",
  "p",
  "picture",
  "pre",
  "progress",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "script",
  "search",
  "section",
  "select",
  "slot",
  "small",
  "source",
  "span",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "svg",
  "table",
  "tbody",
  "td",
  "template",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "title",
  "tr",
  "track",
  "u",
  "ul",
  "var",
  "video",
  "wbr",
]);

function unwrapPromptXmlTags(content) {
  if (!content || typeof content !== "string" || !content.includes("<")) {
    return content;
  }
  let cleaned = content;
  let prev;
  let depth = 0;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(
      /<([a-zA-Z0-9_-]+)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/g,
      (match, tagName, inner) => {
        if (!STANDARD_HTML_TAGS.has(tagName.toLowerCase())) {
          return inner.trim();
        }
        return match;
      }
    );
    depth++;
  } while (cleaned !== prev && depth < 5);

  return cleaned.trim();
}

export function renderTranscript(steps, container) {
  state.activeFilters = {
    userQueries: false,
    toolsCalled: false,
    outcomeErrors: false,
    modelResponses: false,
  };
  container.innerHTML = "";

  if (!steps || steps.length === 0) {
    container.innerHTML =
      '<div class="empty-state">No transcript data found.</div>';
    return;
  }

  const cards = steps.map((step, index) => {
    const isUserStep =
      step.source === "USER_EXPLICIT" || step.type === "USER_INPUT";
    const isErrorStep =
      step.status === "ERROR" ||
      step.type === "ERROR_MESSAGE" ||
      (step.type === "RUN_COMMAND" &&
        step.content &&
        step.content.includes("The command failed"));
    const isFinalModelResponse =
      step.source === "MODEL" &&
      (step.type === "PLANNER_RESPONSE" || step.type === "MESSAGE") &&
      step.content &&
      (!step.tool_calls || step.tool_calls.length === 0);

    const card = document.createElement("div");
    let cardClass = "step-card";
    if (isUserStep) cardClass += " user-step";
    else if (isErrorStep) cardClass += " error-step";
    else if (isFinalModelResponse) cardClass += " final-response-step";

    card.className = cardClass;
    if (step.created_at) {
      card.dataset.time = formatTime(step.created_at, false);
      const startMs = new Date(step.created_at).getTime();
      card.dataset.timestamp = startMs;

      let endMs = startMs;
      if (step.content) {
        const match = step.content.match(/Completed At:\s*([^\n]+)/);
        if (match && match[1]) {
          const c = new Date(match[1].trim()).getTime();
          if (!isNaN(c)) endMs = Math.max(endMs, c);
        }
      }
      card.dataset.timestampEnd = endMs;
    }

    card.style.animationDelay = `${Math.min(index * 0.015, 0.3)}s`;

    let badgeClass = "system";
    let icon = "";
    if (step.source === "USER_EXPLICIT" || step.type === "USER_INPUT") {
      badgeClass = "user";
      icon = "👤 ";
    } else if (step.type === "READ_URL_CONTENT") {
      badgeClass = "url";
      icon = "🌐 ";
    } else if (
      step.type === "INVOKE_SUBAGENT" ||
      step.type === "BROWSER_SUBAGENT"
    ) {
      badgeClass = "subagent";
      icon = "🤖 ";
    } else if (step.type === "GENERATE_IMAGE") {
      badgeClass = "image";
      icon = "🖼️ ";
    } else if (step.type === "ASK_QUESTION") {
      badgeClass = "question";
      icon = "❓ ";
    } else if (step.type === "MCP_TOOL") {
      badgeClass = "mcp";
      icon = "🔌 ";
    } else if (step.type === "RUN_COMMAND") {
      badgeClass = "tool";
      icon = "⚡ ";
    } else if (step.type === "SEARCH_WEB") {
      badgeClass = "tool";
      icon = "🔍 ";
    } else if (step.type === "VIEW_FILE") {
      badgeClass = "tool";
      icon = "📄 ";
    } else if (step.source === "MODEL") {
      if (
        step.type &&
        step.type !== "PLANNER_RESPONSE" &&
        step.type !== "MESSAGE"
      ) {
        badgeClass = "tool";
        icon = "⚙️ ";
      } else {
        badgeClass = "model";
        icon = "🧠 ";
      }
    } else if (
      step.type &&
      (step.type.includes("TOOL") ||
        step.type.includes("VIEW_FILE") ||
        step.type.includes("COMMAND"))
    ) {
      badgeClass = "tool";
      icon = "⚙️ ";
    }

    card.dataset.isUser = isUserStep ? "true" : "false";
    card.dataset.isTool =
      badgeClass === "tool" || (step.tool_calls && step.tool_calls.length > 0)
        ? "true"
        : "false";
    card.dataset.isError = isErrorStep ? "true" : "false";
    card.dataset.isModel = isFinalModelResponse ? "true" : "false";

    const hasContent =
      step.content ||
      step.thinking ||
      step.error ||
      (step.tool_calls && step.tool_calls.length > 0);

    const header = document.createElement("div");
    header.className = "step-header";

    const typeStr = step.type || "UNKNOWN";
    const sourceStr = step.source || "UNKNOWN";

    header.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                ${
                  hasContent
                    ? '<span class="chevron">›</span>'
                    : '<span style="width:16px;"></span>'
                }
                <span class="badge ${badgeClass}">${sourceStr}</span>
                <span style="font-family:var(--font-mono); font-weight:500; font-size:0.9rem;">${icon}${typeStr}</span>
            </div>
            <div class="step-meta ${badgeClass}" style="display:flex; align-items:center; gap:6px;">
              ${
                step.created_at
                  ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ` +
                    formatTime(step.created_at, true)
                  : ""
              }
            </div>
        `;

    if (isErrorStep) {
      const stepMeta = header.querySelector(".step-meta");
      if (stepMeta) {
        const stepChatBtn = document.createElement("button");
        stepChatBtn.className = "step-chat-btn";
        stepChatBtn.innerHTML = `💬 Ask Chat`;
        stepChatBtn.title = `Ask assistant about step #${index + 1} failure`;
        stepChatBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openDrawer({
            type: "step",
            targetId: `${index + 1}`,
            label: `Step #${index + 1} (${typeStr})`,
          });
        });
        stepMeta.appendChild(stepChatBtn);
      }
    }

    card.appendChild(header);

    if (!hasContent) {
      header.style.cursor = "default";
      return card;
    }

    const body = document.createElement("div");
    body.className = "step-body collapsed";

    header.style.cursor = "pointer";
    header.addEventListener("click", () => {
      const isCollapsed = body.classList.contains("collapsed");
      if (isCollapsed) {
        body.classList.remove("collapsed");
        header.querySelector(".chevron").style.transform = "rotate(90deg)";
      } else {
        body.classList.add("collapsed");
        header.querySelector(".chevron").style.transform = "rotate(0deg)";
      }
    });

    let html = "";
    if (step.thinking) {
      html += `<div class="thought-box">${marked.parse(step.thinking)}</div>`;
    }

    if (step.content) {
      let formattedContent;
      if (
        step.type === "USER_INPUT" ||
        step.type === "PLANNER_RESPONSE" ||
        step.type === "MESSAGE" ||
        step.type === "SEARCH_WEB"
      ) {
        let processedContent = step.content;
        if (step.type === "USER_INPUT") {
          let fileMap = {};
          const metadataMatch = processedContent.match(
            /<ADDITIONAL_METADATA>([\s\S]*?)<\/ADDITIONAL_METADATA>/
          );
          if (metadataMatch) {
            const metaContent = metadataMatch[1];
            const mentionRegex = /@\[(.*?)\] is a \[File\]:\n(.*?)(?=\n|$)/g;
            let m;
            while ((m = mentionRegex.exec(metaContent)) !== null) {
              fileMap[m[1]] = m[2].trim();
            }

            processedContent = processedContent.replace(
              /@\[(.*?)\]/g,
              (match, filename) => {
                if (fileMap[filename]) {
                  return `[${match}](file://${fileMap[filename]})`;
                }
                return match;
              }
            );
          }
        }

        if (step.type === "USER_INPUT" && processedContent.includes("<")) {
          let htmlParts = "";
          let hasTags = false;
          const tagRegex = /<([A-Z_]+)>([\s\S]*?)<\/\1>/g;
          let match;
          let lastIndex = 0;
          while ((match = tagRegex.exec(processedContent)) !== null) {
            hasTags = true;
            if (match.index > lastIndex) {
              const preText = processedContent
                .substring(lastIndex, match.index)
                .trim();
              if (preText) {
                const cleanPre = unwrapPromptXmlTags(preText);
                htmlParts += `<div class="user-request-block">${marked.parse(
                  cleanPre
                )}</div>`;
              }
            }
            const tagName = match[1];
            const tagContent = match[2].trim();
            if (tagName === "USER_REQUEST") {
              const cleanUserContent = unwrapPromptXmlTags(tagContent);
              htmlParts += `<div class="user-request-block">${marked.parse(
                cleanUserContent
              )}</div>`;
            } else {
              const niceName = tagName
                .split("_")
                .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
                .join(" ");
              const cleanContext = unwrapPromptXmlTags(tagContent);
              htmlParts += `<div class="system-context-block"><strong>${niceName}</strong><div class="system-context-content">${marked.parse(
                cleanContext
              )}</div></div>`;
            }
            lastIndex = tagRegex.lastIndex;
          }
          if (lastIndex < processedContent.length) {
            const postText = processedContent.substring(lastIndex).trim();
            if (postText) {
              const cleanPost = unwrapPromptXmlTags(postText);
              htmlParts += `<div class="user-request-block">${marked.parse(
                cleanPost
              )}</div>`;
            }
          }
          formattedContent = `<div class="markdown-body">${
            hasTags
              ? htmlParts
              : marked.parse(unwrapPromptXmlTags(processedContent))
          }</div>`;
        } else {
          let contentText = processedContent;
          let prefixHtml = "";
          if (step.type === "SEARCH_WEB") {
            // Extract standard tool metadata
            const metaRegex =
              /^(?:Created At:\s*(.*?)\n)?(?:Completed At:\s*(.*?)\n)?(?:Encountered error in step execution:\s*(.*?\n))?/;
            const match = contentText.match(metaRegex);
            if (match && match[0]) {
              contentText = contentText.substring(match[0].length).trim();
              const created = match[1];
              const completed = match[2];
              const errorMsg = match[3];

              // Extract search phrase (e.g. "The search for "test" returned the following summary:")
              const searchPhraseRegex =
                /^The search for "(.*?)" returned the following summary:\n/i;
              const searchMatch = contentText.match(searchPhraseRegex);
              let searchPhrase = "";
              if (searchMatch) {
                searchPhrase = searchMatch[1].trim();
                contentText = contentText
                  .substring(searchMatch[0].length)
                  .trim();
              }

              let metaHtml = `<div class="tool-meta-header" style="font-size:0.85em; color:var(--text-secondary); margin-bottom:12px; display:flex; flex-direction:column; gap:4px; padding-left:8px; border-left:2px solid rgba(148,163,184,0.3);">`;
              if (created && completed) {
                metaHtml += `<div>⏱ <strong>Duration:</strong> ${(
                  (new Date(completed) - new Date(created)) /
                  1000
                ).toFixed(1)}s</div>`;
              } else if (created) {
                metaHtml += `<div>⏱ <strong>Started:</strong> ${formatTime(
                  created,
                  true
                )}</div>`;
              }
              if (searchPhrase) {
                metaHtml += `<div>🔍 <strong>Query:</strong> ${escapeHtml(
                  searchPhrase
                )}</div>`;
              }
              if (errorMsg) {
                metaHtml += `<div style="color:#ef4444;">🚨 <strong>Error:</strong> ${escapeHtml(
                  errorMsg.trim()
                )}</div>`;
              }
              metaHtml += `</div>`;
              prefixHtml = metaHtml;
            }

            // Extract URL map and format definitions dynamically
            let linkMap = {};
            const defRegex =
              /\[(\d+)\]\s*(?:\[.*?\]\((https?:\/\/[^\s\)]+)\)|(https?:\/\/[^\s\)]+))/g;
            let m;
            while ((m = defRegex.exec(contentText)) !== null) {
              linkMap[m[1]] = m[2] || m[3];
            }

            // Replace inline references first, grouping adjacent citations into a single superscript
            const seqRegex = /(?:\[\d+\](?:\s*\[\d+\])*)/g;
            contentText = contentText.replace(
              seqRegex,
              (match, offset, str) => {
                const after = str.substring(offset + match.length);
                if (
                  after.match(/^\s*\[.*?\]\(http/) ||
                  after.match(/^\s*http/)
                ) {
                  return match; // It's a footer definition
                }

                let ids = [];
                const idRegex = /\[(\d+)\]/g;
                let m;
                while ((m = idRegex.exec(match)) !== null) {
                  ids.push(m[1]);
                }

                let linksHtml = ids
                  .map((id) => {
                    if (linkMap[id])
                      return `<a href="${linkMap[id]}" target="_blank" style="text-decoration:none; color:var(--accent-blue); font-weight:600;">${id}</a>`;
                    return id;
                  })
                  .join(", ");

                return `<sup>${linksHtml}</sup>`;
              }
            );

            // Now replace all footer definitions with markdown list items
            contentText = contentText.replace(
              /\[(\d+)\]\s*(?:\[.*?\]\((https?:\/\/[^\s\)]+)\)|(https?:\/\/[^\s\)]+))/g,
              "\n\n- $&"
            );
          }
          formattedContent =
            prefixHtml +
            `<div class="markdown-body">${marked.parse(contentText)}</div>`;
        }
      } else {
        let contentText = step.content;
        let metaHtml = "";

        const metaRegex =
          /^(?:Created At:\s*(.*?)\n)?(?:Completed At:\s*(.*?)\n)?(?:Encountered error in step execution:\s*(.*?\n))?/;
        const match = contentText.match(metaRegex);

        if (match && match[0]) {
          contentText = contentText.substring(match[0].length).trim();
          const created = match[1];
          const completed = match[2];
          const errorMsg = match[3];

          let statusMsg = "";
          const statusRegex =
            /^\s*(The command (completed successfully\.|failed with exit code: \d+))/m;
          const statusMatch = contentText.match(statusRegex);
          if (statusMatch) {
            statusMsg = statusMatch[1];
            contentText = contentText.replace(statusMatch[0], "").trim();
          }

          if (created || completed || errorMsg || statusMsg) {
            metaHtml = `<div class="tool-meta-header" style="font-size:0.85em; color:var(--text-secondary); margin-bottom:12px; display:flex; flex-direction:column; gap:4px; padding-left:8px; border-left:2px solid rgba(148,163,184,0.3);">`;
            if (created && completed) {
              metaHtml += `<div>⏱ <strong>Duration:</strong> ${(
                (new Date(completed) - new Date(created)) /
                1000
              ).toFixed(1)}s</div>`;
            } else if (created) {
              metaHtml += `<div>⏱ <strong>Started:</strong> ${formatTime(
                created,
                true
              )}</div>`;
            }
            if (statusMsg) {
              const isSuccess = statusMsg.includes("successfully");
              const icon = isSuccess ? "✅" : "❌";
              const color = isSuccess ? "#10b981" : "#ef4444"; // emerald green or red
              metaHtml += `<div style="color:${color};">${icon} <strong>Status:</strong> ${escapeHtml(
                statusMsg
              )}</div>`;
            }
            if (errorMsg) {
              metaHtml += `<div style="color:#ef4444;">🚨 <strong>Error:</strong> ${escapeHtml(
                errorMsg.trim()
              )}</div>`;
            }
            metaHtml += `</div>`;
          }
        }

        // Clean up weird Antigravity framework indentation (up to 4 leading tabs)
        contentText = contentText.replace(/^\t{1,4}/gm, "");

        // Remove superfluous wrapper labels
        contentText = contentText
          .replace(/^(?:Output|Stdout|Stderr):\s*\n?/gm, "")
          .trim();

        // 1. Detect Background Tasks
        let bgTaskHtml = "";
        const bgTaskRegex =
          /Task id ["']?([^\s"'\n]+(?:\/task-\d+)?)["']? (?:is running|finished|completed)|task id:\s*["']?([^\s"'\n]+\/task-\d+)["']?/i;
        const bgTaskMatch = contentText.match(bgTaskRegex);
        const logRegex =
          /(?:Task logs are available at:|Log:)\s*(?:file:\/\/)?([^\s\n]+\/\.system_generated\/tasks\/task-[^\s\n]+\.log)/i;
        const logMatch = contentText.match(logRegex);

        if (bgTaskMatch || logMatch) {
          const rawId = bgTaskMatch ? bgTaskMatch[1] || bgTaskMatch[2] : "task";
          const taskId = rawId.includes("/") ? rawId.split("/")[1] : rawId;
          const logPath = logMatch ? logMatch[1] : "";
          bgTaskHtml = `
            <div class="bg-task-card" style="margin: 8px 0 12px; padding: 10px 14px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
              <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-size:1.2rem;">⚡</span>
                <div>
                  <div style="font-size:0.85rem; font-weight:600; color:#60a5fa;">Background Task: <span style="font-family:var(--font-mono); font-weight:500;">${escapeHtml(
                    taskId
                  )}</span></div>
                  <div style="font-size:0.75rem; color:var(--text-secondary);">Asynchronous task execution</div>
                </div>
              </div>
              ${
                logPath
                  ? `<button class="view-task-log-btn btn secondary" data-log-path="${escapeHtml(
                      logPath
                    )}" style="padding: 4px 10px; font-size: 0.8rem; margin: 0; display:flex; align-items:center; gap:4px;">📋 View Task Log</button>`
                  : ""
              }
            </div>
          `;
        }

        // 2. Detect Spooled Content Files
        let spooledHtml = "";
        const spooledRegex =
          /(?:saved to|spooled to):\s*(?:file:\/\/)?([^\s\n]+\/\.system_generated\/steps\/\d+\/([a-zA-Z0-9_.-]+))/i;
        const spooledMatch = contentText.match(spooledRegex);
        if (spooledMatch) {
          const spooledFullPath = spooledMatch[1];
          const spooledFileName = spooledMatch[2];
          spooledHtml = `
            <div class="spooled-banner" style="margin: 8px 0 12px; padding: 8px 12px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:1.1rem;">📄</span>
                <span style="font-size:0.85rem; color:var(--text-secondary);">Full content spooled to <code style="color:#34d399; font-weight:600;">${escapeHtml(
                  spooledFileName
                )}</code></span>
              </div>
              <button class="spooled-preview-btn btn secondary" data-spooled-path="${escapeHtml(
                spooledFullPath
              )}" style="padding: 4px 10px; font-size: 0.8rem; margin: 0; display:flex; align-items:center; gap:4px;">
                👁 Inline Preview
              </button>
            </div>
            <div class="spooled-preview-container hidden" style="margin: 8px 0 12px; padding: 14px; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 8px; max-height: 450px; overflow-y: auto;"></div>
          `;
        }

        if (!contentText) {
          formattedContent = metaHtml + bgTaskHtml + spooledHtml;
        } else {
          formattedContent = escapeHtml(contentText);
          try {
            const parsed = JSON.parse(contentText);
            if (typeof parsed === "object" && parsed !== null) {
              formattedContent = syntaxHighlight(
                JSON.stringify(parsed, null, 2)
              );
            }
          } catch (e) {}
          formattedContent =
            metaHtml +
            bgTaskHtml +
            spooledHtml +
            `<div class="code-block">${formattedContent}</div>`;
        }
      }
      html += formattedContent;
    }

    if (step.error) {
      // Prevent rendering the big red box if the error was already captured and displayed in the metadata header
      const errorStr = escapeHtml(step.error.trim());
      if (!html.includes(errorStr)) {
        html += `<div class="code-block" style="color: #ef4444; border-color: #ef4444; background: rgba(239, 68, 68, 0.1); margin-top: 8px;"><strong>ERROR:</strong><br/>${errorStr}</div>`;
      }
    }

    if (step.tool_calls && step.tool_calls.length > 0) {
      step.tool_calls.forEach((tool) => {
        html += `
                    <div class="tool-call">
                        <div class="tool-name">⚙ ${tool.name}</div>
                        <pre class="tool-args json-renderer">${syntaxHighlight(
                          JSON.stringify(tool.args, null, 2)
                        )}</pre>
                    </div>
                `;
      });
    }

    body.innerHTML = html;
    card.appendChild(body);
    return card;
  });

  let currentSequenceContainer = null;
  let currentStepsWrapper = null;
  let currentSequenceContent = null;
  let sequenceCounter = 1;

  cards.forEach((card, index) => {
    const isUserStep = card.dataset.isUser === "true";

    if (isUserStep || !currentSequenceContainer) {
      currentSequenceContainer = document.createElement("div");
      currentSequenceContainer.className = "sequence-wrapper";
      Object.assign(currentSequenceContainer.style, {
        marginBottom: "16px",
        background: "rgba(30, 41, 59, 0.3)",
        border: "1px solid rgba(148, 163, 184, 0.15)",
        borderRadius: "16px",
        padding: "16px",
        boxShadow:
          "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
        transition: "all 0.3s ease",
      });
      if (card.dataset.timestamp) {
        currentSequenceContainer.dataset.timestampStart =
          card.dataset.timestamp;
        currentSequenceContainer.dataset.timestampEnd = card.dataset.timestamp;
      }
      container.appendChild(currentSequenceContainer);

      const sequenceHeader = document.createElement("div");
      Object.assign(sequenceHeader.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        cursor: "pointer",
        marginBottom: "12px",
        color: "var(--text-secondary)",
        fontSize: "0.75rem",
        fontWeight: "600",
        letterSpacing: "0.05em",
        userSelect: "none",
      });
      let durationText = "";
      try {
        if (card.dataset.timestamp) {
          const startIndex = index;
          let endIndex = index;
          for (let i = index + 1; i < steps.length; i++) {
            if (cards[i] && cards[i].dataset.isUser === "true") {
              break;
            }
            endIndex = i;
          }
          if (endIndex > startIndex && cards[endIndex].dataset.timestamp) {
            const startMs = parseInt(card.dataset.timestamp, 10);
            const endMs = parseInt(cards[endIndex].dataset.timestamp, 10);
            currentSequenceContainer.dataset.timestampEnd = endMs;

            const start = new Date(steps[index].created_at);
            const end = new Date(steps[endIndex].created_at);
            const diffMs = end - start;
            if (!isNaN(diffMs) && diffMs >= 0) {
              const diffSec = Math.floor(diffMs / 1000);
              const diffMin = Math.floor(diffSec / 60);
              const diffHour = Math.floor(diffMin / 60);

              if (diffHour > 0) {
                durationText = ` · ⏱ ${diffHour}h ${diffMin % 60}m`;
              } else if (diffMin > 0) {
                durationText = ` · ⏱ ${diffMin}m ${diffSec % 60}s`;
              } else if (diffSec > 0) {
                durationText = ` · ⏱ ${diffSec}s`;
              } else {
                durationText = ` · ⏱ <1s`;
              }
            }
          }
        }
      } catch (e) {
        console.error("Error calculating duration", e);
      }

      sequenceHeader.innerHTML = `
        <span class="seq-chevron" style="display:inline-block; transition: transform 0.2s; transform: rotate(90deg); font-size: 1.2rem; line-height: 1;">›</span>
        <span>Sequence ${sequenceCounter++}${durationText}</span>
      `;
      const currentSeqNum = sequenceCounter - 1;
      const seqChatBtn = document.createElement("button");
      seqChatBtn.className = "seq-chat-btn";
      seqChatBtn.innerHTML = `💬 Ask Chat`;
      seqChatBtn.title = `Ask assistant about Sequence #${currentSeqNum}`;
      seqChatBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openDrawer({
          type: "sequence",
          targetId: `${currentSeqNum}`,
          label: `Sequence #${currentSeqNum}`,
        });
      });
      sequenceHeader.appendChild(seqChatBtn);
      currentSequenceContainer.appendChild(sequenceHeader);

      currentSequenceContent = document.createElement("div");
      currentSequenceContent.className = "sequence-content";
      currentSequenceContainer.appendChild(currentSequenceContent);

      currentSequenceContent.appendChild(card);

      currentStepsWrapper = document.createElement("div");
      currentStepsWrapper.className = "sequence-steps";
      Object.assign(currentStepsWrapper.style, {
        marginTop: "0",
      });
      currentSequenceContent.appendChild(currentStepsWrapper);

      const localContent = currentSequenceContent;
      sequenceHeader.addEventListener("click", () => {
        const isCollapsed = localContent.style.display === "none";
        localContent.style.display = isCollapsed ? "block" : "none";
        sequenceHeader.querySelector(".seq-chevron").style.transform =
          isCollapsed ? "rotate(90deg)" : "rotate(0deg)";
        sequenceHeader.style.marginBottom = isCollapsed ? "12px" : "0";
      });
    } else {
      currentStepsWrapper.appendChild(card);
      if (card.dataset.timestamp) {
        currentSequenceContainer.dataset.timestampEnd = card.dataset.timestamp;
      }
    }
  });

  const bottomMarker = document.createElement("div");
  bottomMarker.id = "timeline-bottom-marker";
  bottomMarker.style.height = "1px";
  bottomMarker.style.width = "100%";
  if (window.timelineStart && window.timelineTotalMs) {
    bottomMarker.dataset.timestamp =
      window.timelineStart + window.timelineTotalMs;
  }
  container.appendChild(bottomMarker);

  // Event delegation for spooled content previews and task log views
  container.addEventListener("click", async (e) => {
    const taskLogBtn = e.target.closest(".view-task-log-btn");
    if (taskLogBtn) {
      e.stopPropagation();
      const logPath = taskLogBtn.dataset.logPath;
      const modal = document.getElementById("file-modal");
      const modalTitle = document.getElementById("file-modal-title");
      const modalContent = document.getElementById("file-modal-content");
      if (modal && modalTitle && modalContent) {
        modalTitle.innerText = logPath;
        modalContent.innerText = "Loading task log...";
        modal.classList.remove("hidden");
        try {
          const res = await fetch(
            `/api/brain/file?path=${encodeURIComponent(logPath)}`
          );
          if (!res.ok) throw new Error("Log file not found or empty");
          const logText = await res.text();
          modalContent.innerText = logText;
          hljs.highlightElement(modalContent);
        } catch (err) {
          modalContent.innerText = err.message;
        }
      }
      return;
    }

    const spooledBtn = e.target.closest(".spooled-preview-btn");
    if (spooledBtn) {
      e.stopPropagation();
      const spooledPath = spooledBtn.dataset.spooledPath;
      const stepBody = spooledBtn.closest(".step-body");
      const previewContainer = stepBody?.querySelector(
        ".spooled-preview-container"
      );
      if (previewContainer) {
        const isHidden = previewContainer.classList.contains("hidden");
        if (isHidden) {
          previewContainer.classList.remove("hidden");
          spooledBtn.innerText = "🙈 Hide Preview";
          if (!previewContainer.dataset.loaded) {
            previewContainer.innerHTML =
              '<div class="loading-state">Loading spooled file...</div>';
            try {
              const res = await fetch(
                `/api/brain/file?path=${encodeURIComponent(spooledPath)}`
              );
              if (!res.ok) throw new Error("Failed to load spooled file");
              const text = await res.text();
              previewContainer.dataset.loaded = "true";
              if (spooledPath.endsWith(".md")) {
                previewContainer.innerHTML = `<div class="markdown-body">${marked.parse(
                  text
                )}</div>`;
                previewContainer
                  .querySelectorAll("pre code")
                  .forEach((el) => hljs.highlightElement(el));
              } else {
                previewContainer.innerHTML = `<pre class="code-block"><code>${escapeHtml(
                  text
                )}</code></pre>`;
                previewContainer
                  .querySelectorAll("pre code")
                  .forEach((el) => hljs.highlightElement(el));
              }
            } catch (err) {
              previewContainer.innerHTML = `<div style="color:var(--error);">${escapeHtml(
                err.message
              )}</div>`;
            }
          }
        } else {
          previewContainer.classList.add("hidden");
          spooledBtn.innerText = "👁 Inline Preview";
        }
      }
    }
  });

  window.dispatchEvent(new Event("transcriptLoaded"));
}

window.scrollToTime = function (targetTimeMs) {
  const cards = Array.from(
    document.querySelectorAll(".step-card[data-timestamp]")
  );
  if (cards.length === 0) return;

  let bestAfter = null;
  let minDiffAfter = Infinity;
  let bestBefore = null;
  let minDiffBefore = Infinity;

  cards.forEach((c) => {
    const ts = parseInt(c.dataset.timestamp, 10);
    const diff = ts - targetTimeMs;

    if (diff >= 0 && diff < minDiffAfter) {
      minDiffAfter = diff;
      bestAfter = c;
    } else if (diff < 0 && Math.abs(diff) < minDiffBefore) {
      minDiffBefore = Math.abs(diff);
      bestBefore = c;
    }
  });

  // Bias towards showing the next step/sequence if we click exactly in a gap,
  // but fall back to the closest previous step if there are no steps after.
  const targetCard = bestAfter || bestBefore;

  if (targetCard) {
    // Expand the sequence if it is collapsed
    const seqContent = targetCard.closest(".sequence-content");
    if (seqContent && seqContent.style.display === "none") {
      const seqHeader = seqContent.previousElementSibling;
      if (seqHeader) seqHeader.click();
    }

    targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
    targetCard.style.transition = "box-shadow 0.3s ease";
    targetCard.style.boxShadow =
      "0 0 0 2px var(--accent-blue), 0 0 20px rgba(96, 165, 250, 0.4)";
    setTimeout(() => {
      targetCard.style.boxShadow = "";
    }, 2000);
  }
};
