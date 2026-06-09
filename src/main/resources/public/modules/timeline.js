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
    if (step.created_at) card.dataset.time = formatTime(step.created_at, false);
    card.style.animationDelay = `${Math.min(index * 0.015, 0.3)}s`;

    let badgeClass = "system";
    if (step.source === "USER_EXPLICIT") {
      badgeClass = "user";
    } else if (step.source === "MODEL") {
      if (
        step.type &&
        step.type !== "PLANNER_RESPONSE" &&
        step.type !== "MESSAGE" &&
        step.type !== "ASK_QUESTION"
      ) {
        badgeClass = "tool";
      } else {
        badgeClass = "model";
      }
    } else if (
      step.type &&
      (step.type.includes("TOOL") ||
        step.type.includes("VIEW_FILE") ||
        step.type.includes("COMMAND"))
    ) {
      badgeClass = "tool";
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
                <span style="font-family:var(--font-mono); font-weight:500; font-size:0.9rem;">${typeStr}</span>
            </div>
            <div class="step-meta ${badgeClass}">${
      step.created_at
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ` +
          formatTime(step.created_at, true)
        : ""
    }</div>
        `;

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
              if (preText)
                htmlParts += `<div class="user-request-block">${marked.parse(
                  preText
                )}</div>`;
            }
            const tagName = match[1];
            const tagContent = match[2].trim();
            if (tagName === "USER_REQUEST") {
              htmlParts += `<div class="user-request-block">${marked.parse(
                tagContent
              )}</div>`;
            } else {
              const niceName = tagName
                .split("_")
                .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
                .join(" ");
              htmlParts += `<div class="system-context-block"><strong>${niceName}</strong><div class="system-context-content">${marked.parse(
                tagContent
              )}</div></div>`;
            }
            lastIndex = tagRegex.lastIndex;
          }
          if (lastIndex < processedContent.length) {
            const postText = processedContent.substring(lastIndex).trim();
            if (postText)
              htmlParts += `<div class="user-request-block">${marked.parse(
                postText
              )}</div>`;
          }
          formattedContent = `<div class="markdown-body">${
            hasTags ? htmlParts : marked.parse(processedContent)
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

        if (!contentText) {
          formattedContent = metaHtml;
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
            metaHtml + `<div class="code-block">${formattedContent}</div>`;
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
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
        transition: "all 0.3s ease"
      });
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
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        userSelect: "none"
      });
      sequenceHeader.innerHTML = `
        <span class="seq-chevron" style="display:inline-block; transition: transform 0.2s; transform: rotate(90deg); font-size: 1.2rem; line-height: 1;">›</span>
        <span>Sequence ${sequenceCounter++}</span>
      `;
      currentSequenceContainer.appendChild(sequenceHeader);

      currentSequenceContent = document.createElement("div");
      currentSequenceContent.className = "sequence-content";
      currentSequenceContainer.appendChild(currentSequenceContent);

      currentSequenceContent.appendChild(card);

      currentStepsWrapper = document.createElement("div");
      currentStepsWrapper.className = "sequence-steps";
      Object.assign(currentStepsWrapper.style, {
        marginTop: "0"
      });
      currentSequenceContent.appendChild(currentStepsWrapper);

      const localContent = currentSequenceContent;
      sequenceHeader.addEventListener("click", () => {
        const isCollapsed = localContent.style.display === "none";
        localContent.style.display = isCollapsed ? "block" : "none";
        sequenceHeader.querySelector(".seq-chevron").style.transform = isCollapsed ? "rotate(90deg)" : "rotate(0deg)";
        sequenceHeader.style.marginBottom = isCollapsed ? "12px" : "0";
      });

    } else {
      currentStepsWrapper.appendChild(card);
    }
  });

  window.dispatchEvent(new Event("transcriptLoaded"));
}
