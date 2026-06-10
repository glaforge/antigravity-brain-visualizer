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
export const state = {
  activeFilters: {
    userQueries: false,
    toolsCalled: false,
    outcomeErrors: false,
    modelResponses: false,
  },
  spansMultipleDays: false,
  summaryCache: {},
};

export function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function syntaxHighlight(json) {
  if (typeof json != "string") {
    json = JSON.stringify(json, undefined, 2);
  }
  json = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    function (match) {
      var cls = "json-number";
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = "json-key";
        } else {
          cls = "json-string";
        }
      } else if (/true|false/.test(match)) {
        cls = "json-boolean";
      } else if (/null/.test(match)) {
        cls = "json-null";
      }
      return '<span class="' + cls + '">' + match + "</span>";
    }
  );
}

export function formatTime(dateStr, withSeconds = false) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (state.spansMultipleDays) {
    if (withSeconds) {
      return (
        d.toLocaleDateString([], { month: "short", day: "numeric" }) +
        ", " +
        d.toLocaleTimeString([], { hour12: false })
      );
    } else {
      return (
        d.toLocaleDateString([], { month: "short", day: "numeric" }) +
        ", " +
        d.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      );
    }
  } else {
    if (withSeconds) {
      return d.toLocaleTimeString([], { hour12: false });
    } else {
      return d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
  }
}

export function updateTranscriptFilter() {
  const cards = document.querySelectorAll(".step-card");
  const { userQueries, toolsCalled, outcomeErrors, modelResponses } =
    state.activeFilters;

  if (!userQueries && !toolsCalled && !outcomeErrors && !modelResponses) {
    cards.forEach((c) => (c.style.display = "block"));
    return;
  }

  cards.forEach((c) => {
    const isUser = c.dataset.isUser === "true";
    const isTool = c.dataset.isTool === "true";
    const isError = c.dataset.isError === "true";
    const isModel = c.dataset.isModel === "true";

    let show = false;
    if (userQueries && isUser) show = true;
    if (toolsCalled && isTool) show = true;
    if (outcomeErrors && isError) show = true;
    if (modelResponses && isModel) show = true;

    c.style.display = show ? "block" : "none";
  });

  const wrappers = document.querySelectorAll(".sequence-wrapper");
  wrappers.forEach((wrapper) => {
    const hasVisibleCard = Array.from(
      wrapper.querySelectorAll(".step-card")
    ).some((c) => c.style.display === "block");
    wrapper.style.display = hasVisibleCard ? "block" : "none";
  });
}
