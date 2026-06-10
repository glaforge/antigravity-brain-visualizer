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
import {
  state,
  escapeHtml,
  updateTranscriptFilter,
  formatTime,
} from "./utils.js";

export function renderStats(steps) {
  const container = document.getElementById("session-stats-container");
  if (!container) return;

  if (!steps || steps.length === 0) {
    container.classList.add("hidden");
    return;
  }
  container.classList.remove("hidden");

  let toolsCalled = 0;
  let userQueries = 0;
  let errors = 0;
  let modelResponses = 0;
  let toolFrequencies = {};
  let errorFrequencies = {};
  let segments = [];
  let currentSegment = null;
  const sortedSteps = [...steps]
    .filter((s) => s.created_at)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  const getStepEndTime = (step) => {
    let t = new Date(step.created_at).getTime();
    if (step.content) {
      const match = step.content.match(/Completed At:\s*([^\n]+)/);
      if (match && match[1]) {
        const c = new Date(match[1].trim()).getTime();
        if (!isNaN(c)) t = Math.max(t, c);
      }
    }
    return t;
  };

  sortedSteps.forEach((step) => {
    const t = new Date(step.created_at).getTime();
    const endT = getStepEndTime(step);
    if (step.type === "USER_INPUT" || !currentSegment) {
      if (currentSegment) {
        segments.push(currentSegment);
      }
      currentSegment = { start: t, end: endT, steps: 1 };
    } else {
      currentSegment.end = Math.max(currentSegment.end, endT);
      currentSegment.steps++;
    }
  });
  if (currentSegment) {
    segments.push(currentSegment);
  }

  steps.forEach((step) => {
    if (step.tool_calls && step.tool_calls.length > 0) {
      toolsCalled += step.tool_calls.length;
      step.tool_calls.forEach((tool) => {
        let toolName = tool.name || tool.function?.name || "unknown_tool";
        toolFrequencies[toolName] = (toolFrequencies[toolName] || 0) + 1;
      });
    } else if (
      step.type &&
      (step.type.includes("TOOL") ||
        step.type.includes("VIEW_FILE") ||
        step.type.includes("COMMAND"))
    ) {
      toolsCalled++;
    }
    if (step.source === "USER_EXPLICIT" || step.type === "USER_INPUT") {
      userQueries++;
    }
    if (
      step.source === "MODEL" &&
      (step.type === "PLANNER_RESPONSE" || step.type === "MESSAGE") &&
      step.content &&
      (!step.tool_calls || step.tool_calls.length === 0)
    ) {
      modelResponses++;
    }
    const isErrorStep =
      step.status === "ERROR" ||
      step.type === "ERROR_MESSAGE" ||
      (step.type === "RUN_COMMAND" &&
        step.content &&
        step.content.includes("The command failed"));
    if (isErrorStep) {
      errors++;

      let errMsg = "Unknown Error";
      if (step.type === "RUN_COMMAND") {
        errMsg = "Command execution failed";
      } else {
        let source = step.error || step.content || "";
        let lines = source
          .split("\n")
          .map((l) => l.trim())
          .filter(
            (l) =>
              l &&
              !l.startsWith("Created At:") &&
              !l.startsWith("Completed At:")
          );
        if (lines.length > 0) {
          errMsg = lines[0];
          const prefix = "Encountered error in step execution: ";
          if (errMsg.startsWith(prefix)) {
            errMsg = errMsg.substring(prefix.length).trim();
          }
          errMsg = errMsg.substring(0, 100);
        }
      }

      errorFrequencies[errMsg] = (errorFrequencies[errMsg] || 0) + 1;
    }
  });

  let durationStr = "0s";
  if (segments.length > 0) {
    const diffMs = segments[segments.length - 1].end - segments[0].start;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);

    if (diffHours > 0) {
      durationStr = `${diffHours}h ${diffMins % 60}m`;
    } else if (diffMins > 0) {
      durationStr = `${diffMins}m ${diffSecs % 60}s`;
    } else {
      durationStr = `${diffSecs}s`;
    }
  }

  let durationChartHtml =
    '<div class="tools-chart" id="duration-chart" style="display: none; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-color);">';
  durationChartHtml +=
    '<div style="font-size: 0.75rem; font-weight: 700; color: #f59e0b; margin-bottom: 16px; letter-spacing: 0.05em; text-transform: uppercase;">Session Timeline</div>';

  if (segments.length === 0) {
    durationChartHtml += '<div class="stat-sub">No active segments</div>';
  } else {
    const totalMs = segments[segments.length - 1].end - segments[0].start;
    window.timelineStart = segments[0].start;
    window.timelineTotalMs = totalMs;

    const bottomMarker = document.getElementById("timeline-bottom-marker");
    if (bottomMarker) {
      bottomMarker.dataset.timestamp =
        window.timelineStart + window.timelineTotalMs;
    }

    let totalPausedMs = 0;
    let totalActiveMs = 0;
    segments.forEach((seg) => (totalActiveMs += seg.end - seg.start));
    if (segments.length > 1) {
      for (let i = 1; i < segments.length; i++) {
        totalPausedMs += segments[i].start - segments[i - 1].end;
      }
    }

    const formatMs = (ms) => {
      const secs = Math.floor(ms / 1000);
      const mins = Math.floor(secs / 60);
      const hrs = Math.floor(mins / 60);
      if (hrs > 0) return `${hrs}h ${mins % 60}m`;
      if (mins > 0) return `${mins}m ${secs % 60}s`;
      return `${secs}s`;
    };

    const defaultSummary = `<span>Active: <strong style="color:var(--text-primary);">${
      formatMs(totalActiveMs) === "0s" ? "Instant" : formatMs(totalActiveMs)
    }</strong></span><span>Paused: <strong style="color:var(--text-primary);">${formatMs(
      totalPausedMs
    )}</strong></span>`;

    durationChartHtml +=
      '<div style="position: relative; height: 24px; width: 100%; background: rgba(30, 41, 59, 0.4); border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">';

    if (totalMs === 0) {
      durationChartHtml += `<div style="position: absolute; left: 0%; width: 100%; height: 100%; background: #f59e0b;" onmouseover="const el=document.getElementById('timeline-hover-info'); el.innerHTML='<span style=\\'color:#f59e0b;\\'>Instant action</span>';" onmouseout="const el=document.getElementById('timeline-hover-info'); el.innerHTML=el.getAttribute('data-default');"></div>`;
    } else {
      let lastEnd = segments[0].start;
      segments.forEach((seg, index) => {
        const gapMs = seg.start - lastEnd;
        if (gapMs > 0) {
          const gapStartPct =
            ((lastEnd - window.timelineStart) / totalMs) * 100;
          const gapPct = (gapMs / totalMs) * 100;
          const gapStartStr = formatTime(lastEnd, false);
          const gapEndStr = formatTime(seg.start, false);
          const gapLenStr = formatMs(gapMs);
          const hoverText = `<span style=\\'color:var(--text-secondary);\\'>Pause: ${gapStartStr} - ${gapEndStr} (<strong style=\\'color:var(--text-primary);\\'>${gapLenStr}</strong>)</span>`;
          durationChartHtml += `<div style="position: absolute; left: ${gapStartPct}%; width: ${gapPct}%; height: 100%; background: transparent; cursor: pointer; transition: background 0.2s;" onclick="if(window.scrollToTime) { const pct = event.offsetX / this.offsetWidth; window.scrollToTime(${lastEnd} + pct * ${gapMs}); }" onmouseover="this.style.background='rgba(255,255,255,0.05)'; const el=document.getElementById('timeline-hover-info'); el.innerHTML='${hoverText}';" onmouseout="this.style.background='transparent'; const el=document.getElementById('timeline-hover-info'); el.innerHTML=el.getAttribute('data-default');"></div>`;
        }

        const segMs = seg.end - seg.start;
        const segStartPct =
          ((seg.start - window.timelineStart) / totalMs) * 100;
        const segPct = (segMs / totalMs) * 100;

        const startStr = formatTime(seg.start, false);
        const endStr = formatTime(seg.end, false);
        let lenStr = "Instant";
        if (segMs > 0) {
          const diffSecs = Math.floor(segMs / 1000);
          const diffMins = Math.floor(diffSecs / 60);
          const diffHours = Math.floor(diffMins / 60);
          if (diffHours > 0) lenStr = `${diffHours}h ${diffMins % 60}m`;
          else if (diffMins > 0) lenStr = `${diffMins}m ${diffSecs % 60}s`;
          else lenStr = `${diffSecs}s`;
        }

        const hoverText = `<span style=\\'color:#f59e0b;\\'>Sequence: ${startStr} - ${endStr} (<strong style=\\'color:var(--text-primary);\\'>${lenStr}</strong>)</span>`;
        const leftCss = `calc(${segStartPct}% - ${(segStartPct / 100) * 2}px)`;
        durationChartHtml += `<div style="position: absolute; left: ${leftCss}; width: ${segPct}%; min-width: 2px; height: 100%; background: #f59e0b; cursor: pointer; transition: opacity 0.2s; opacity: 0.8;" onclick="if(window.scrollToTime) { const pct = event.offsetX / Math.max(this.offsetWidth, 2); window.scrollToTime(${seg.start} + pct * ${segMs}); }" onmouseover="this.style.opacity=1; const el=document.getElementById('timeline-hover-info'); el.innerHTML='${hoverText}';" onmouseout="this.style.opacity=0.8; const el=document.getElementById('timeline-hover-info'); el.innerHTML=el.getAttribute('data-default');"></div>`;

        lastEnd = seg.end;
      });
    }
    durationChartHtml += `<div id="session-timeline-indicator" style="position: absolute; top: 0; bottom: 0; left: 0%; width: 0%; background: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.5); box-sizing: border-box; border-radius: 4px; pointer-events: none; transition: left 0.1s ease-out, width 0.1s ease-out; display: none; z-index: 10;"></div>`;
    durationChartHtml += "</div>";

    durationChartHtml += `<div id="timeline-hover-info" data-default='${defaultSummary}' style="display: flex; justify-content: space-between; margin-top: 12px; font-size: 0.8rem; color: var(--text-secondary); transition: all 0.2s;">${defaultSummary}</div>`;
  }
  durationChartHtml += "</div>";

  const sortedTools = Object.entries(toolFrequencies).sort(
    (a, b) => b[1] - a[1]
  );
  let toolsChartHtml =
    '<div class="tools-chart" id="tools-chart" style="display: none; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-color);">';
  toolsChartHtml +=
    '<div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 16px; letter-spacing: 0.05em; text-transform: uppercase;">Tool Distribution</div>';

  if (sortedTools.length === 0) {
    toolsChartHtml += '<div class="stat-sub">No tools called</div>';
  } else {
    const maxFreq = sortedTools[0][1];
    sortedTools.forEach(([name, count]) => {
      const width = Math.max((count / maxFreq) * 100, 2);
      toolsChartHtml += `
                <div class="tool-chart-row" style="display: flex; align-items: center; margin-bottom: 10px; gap: 16px;">
                    <div style="flex: 0 0 200px; font-size: 0.8rem; font-family: var(--font-mono); color: var(--text-primary); text-align: right; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${name}">${name}</div>
                    <div style="flex: 1; height: 8px; background: rgba(30, 41, 59, 0.5); border-radius: 4px; overflow: hidden;">
                        <div style="height: 100%; width: ${width}%; background: var(--accent-purple); border-radius: 4px; transition: width 0.5s ease;"></div>
                    </div>
                    <div style="flex: 0 0 30px; font-size: 0.85rem; color: var(--text-secondary); font-weight: 600;">${count}</div>
                </div>
            `;
    });
  }
  toolsChartHtml += "</div>";

  const sortedErrors = Object.entries(errorFrequencies).sort(
    (a, b) => b[1] - a[1]
  );
  let errorsChartHtml =
    '<div class="tools-chart" id="errors-chart" style="display: none; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-color);">';
  errorsChartHtml +=
    '<div style="font-size: 0.75rem; font-weight: 700; color: var(--error); margin-bottom: 16px; letter-spacing: 0.05em; text-transform: uppercase;">Issues Breakdown</div>';

  if (sortedErrors.length === 0) {
    errorsChartHtml += '<div class="stat-sub">No issues detected</div>';
  } else {
    const maxErrFreq = sortedErrors[0][1];
    sortedErrors.forEach(([name, count]) => {
      const width = Math.max((count / maxErrFreq) * 100, 2);
      errorsChartHtml += `
                <div class="tool-chart-row" style="display: flex; align-items: center; margin-bottom: 10px; gap: 16px;">
                    <div style="flex: 0 0 300px; font-size: 0.8rem; font-family: var(--font-mono); color: var(--text-primary); text-align: right; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${escapeHtml(
                      name
                    )}">${escapeHtml(name)}</div>
                    <div style="flex: 1; height: 8px; background: rgba(30, 41, 59, 0.5); border-radius: 4px; overflow: hidden;">
                        <div style="height: 100%; width: ${width}%; background: var(--error); border-radius: 4px; transition: width 0.5s ease;"></div>
                    </div>
                    <div style="flex: 0 0 30px; font-size: 0.85rem; color: var(--text-secondary); font-weight: 600;">${count}</div>
                </div>
            `;
    });
  }
  errorsChartHtml += "</div>";

  container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card" id="errors-stat-card" style="cursor: ${
              errors > 0 ? "pointer" : "default"
            };">
                <div class="stat-label" style="display:flex; justify-content:space-between; align-items:center;">
                    OUTCOME
                    <span id="errors-chevron" class="chevron" style="display: ${
                      errors > 0 ? "inline-block" : "none"
                    };">›</span>
                </div>
                <div class="stat-value" style="color: ${
                  errors === 0 ? "var(--success)" : "var(--error)"
                };">
                    ${errors === 0 ? "Succeeded" : "Issues Detected"}
                </div>
                <div class="stat-sub">${errors} errors during execution</div>
            </div>
            <div class="stat-card" id="duration-stat-card" style="cursor: pointer;">
                <div class="stat-label" style="display:flex; justify-content:space-between; align-items:center;">
                    DURATION
                    <span id="duration-chevron" class="chevron">›</span>
                </div>
                <div class="stat-value" style="color: #f59e0b;">${durationStr}</div>
                <div class="stat-sub">${segments.length} active segment${
    segments.length !== 1 ? "s" : ""
  }</div>
            </div>
            <div class="stat-card" id="user-queries-stat-card" style="cursor: pointer;">
                <div class="stat-label" style="display:flex; justify-content:space-between; align-items:center;">
                    USER QUERIES
                    <span id="user-queries-chevron" class="chevron" style="display: inline-block; transform: rotate(0deg);">›</span>
                </div>
                <div class="stat-value">${userQueries}</div>
                <div class="stat-sub">Manual interactions</div>
            </div>
            <div class="stat-card" id="tools-stat-card" style="cursor: pointer;">
                <div class="stat-label" style="display:flex; justify-content:space-between; align-items:center;">
                    TOOLS CALLED
                    <span id="tools-chevron" class="chevron">›</span>
                </div>
                <div class="stat-value">${toolsCalled}</div>
                <div class="stat-sub">Agent-driven actions</div>
            </div>
            <div class="stat-card" id="model-responses-stat-card" style="cursor: pointer;">
                <div class="stat-label" style="display:flex; justify-content:space-between; align-items:center;">
                    MODEL RESPONSES
                    <span id="model-responses-chevron" class="chevron" style="display: inline-block; transform: rotate(0deg);">›</span>
                </div>
                <div class="stat-value">${modelResponses}</div>
                <div class="stat-sub">Agent answers</div>
            </div>
        </div>
        ${toolsChartHtml}
        ${errorsChartHtml}
        ${durationChartHtml}
    `;

  const userCard = document.getElementById("user-queries-stat-card");
  if (userCard) {
    userCard.addEventListener("click", () => {
      const chevron = document.getElementById("user-queries-chevron");
      state.activeFilters.userQueries = !state.activeFilters.userQueries;

      if (state.activeFilters.userQueries) {
        chevron.style.transform = "rotate(90deg)";
        userCard.style.borderColor = "var(--accent-blue)";
      } else {
        chevron.style.transform = "rotate(0deg)";
        userCard.style.borderColor = "var(--border-color)";
      }
      if (updateTranscriptFilter) updateTranscriptFilter();
    });
  }

  const modelCard = document.getElementById("model-responses-stat-card");
  if (modelCard) {
    modelCard.addEventListener("click", () => {
      const chevron = document.getElementById("model-responses-chevron");
      state.activeFilters.modelResponses = !state.activeFilters.modelResponses;

      if (state.activeFilters.modelResponses) {
        chevron.style.transform = "rotate(90deg)";
        modelCard.style.borderColor = "#a78bfa";
      } else {
        chevron.style.transform = "rotate(0deg)";
        modelCard.style.borderColor = "var(--border-color)";
      }
      if (updateTranscriptFilter) updateTranscriptFilter();
    });
  }

  const toolsCard = document.getElementById("tools-stat-card");
  if (toolsCard) {
    toolsCard.addEventListener("click", () => {
      const chart = document.getElementById("tools-chart");
      const chevron = document.getElementById("tools-chevron");
      state.activeFilters.toolsCalled = !state.activeFilters.toolsCalled;

      if (state.activeFilters.toolsCalled) {
        chart.style.display = "block";
        chevron.style.transform = "rotate(90deg)";
        toolsCard.style.borderColor = "var(--accent-purple)";
      } else {
        chart.style.display = "none";
        chevron.style.transform = "rotate(0deg)";
        toolsCard.style.borderColor = "var(--border-color)";
      }
      if (updateTranscriptFilter) updateTranscriptFilter();
    });
  }

  const errorsCard = document.getElementById("errors-stat-card");
  if (errorsCard && errors > 0) {
    errorsCard.addEventListener("click", () => {
      const chart = document.getElementById("errors-chart");
      const chevron = document.getElementById("errors-chevron");
      state.activeFilters.outcomeErrors = !state.activeFilters.outcomeErrors;

      if (state.activeFilters.outcomeErrors) {
        chart.style.display = "block";
        chevron.style.transform = "rotate(90deg)";
        errorsCard.style.borderColor = "var(--error)";
      } else {
        chart.style.display = "none";
        chevron.style.transform = "rotate(0deg)";
        errorsCard.style.borderColor = "var(--border-color)";
      }
      if (updateTranscriptFilter) updateTranscriptFilter();
    });
  }

  const durationCard = document.getElementById("duration-stat-card");
  if (durationCard) {
    durationCard.addEventListener("click", () => {
      const chart = document.getElementById("duration-chart");
      const chevron = document.getElementById("duration-chevron");
      if (chart.style.display === "none") {
        chart.style.display = "block";
        chevron.style.transform = "rotate(90deg)";
        durationCard.style.borderColor = "#f59e0b";
      } else {
        chart.style.display = "none";
        chevron.style.transform = "rotate(0deg)";
        durationCard.style.borderColor = "var(--border-color)";
      }
    });
  }
}
