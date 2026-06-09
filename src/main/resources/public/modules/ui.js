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
import { escapeHtml, formatTime } from "./utils.js";

let modal, modalTitle, modalContent;

export function initUI() {
  modal = document.getElementById("file-modal");
  modalTitle = document.getElementById("file-modal-title");
  modalContent = document.getElementById("file-modal-content");
  const closeBtn = document.getElementById("close-modal-btn");

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.classList.add("hidden");
    });
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
      }
    });
  }

  // Intercept file:// links using event delegation
  document.addEventListener("click", async (e) => {
    const link = e.target.closest("a");
    if (link && link.href && link.href.startsWith("file://")) {
      e.preventDefault();

      let path = link.href.replace("file://", "");
      path = path.split("#")[0]; // Strip line numbers hash like #L10-L20
      path = decodeURIComponent(path);

      try {
        const res = await fetch(
          `/api/brain/file?path=${encodeURIComponent(path)}`
        );
        if (!res.ok) {
          if (res.status === 404) throw new Error("File not found");
          throw new Error("Failed to load file");
        }
        const content = await res.text();

        modalTitle.innerText = path;

        const ext = path.split(".").pop().toLowerCase();
        const supportedExts = [
          "js",
          "json",
          "java",
          "html",
          "css",
          "md",
          "sh",
          "bash",
          "yaml",
          "yml",
          "xml",
          "sql",
          "kt",
          "kts",
          "gradle",
          "properties",
          "py",
          "go",
          "rs",
          "cpp",
          "c",
          "ts",
          "jsx",
          "tsx",
        ];
        let langClass = "";
        if (supportedExts.includes(ext)) {
          langClass = `language-${ext}`;
        }

        modalContent.className = langClass;
        modalContent.innerHTML = escapeHtml(content);

        if (langClass && window.hljs) {
          delete modalContent.dataset.highlighted;
          hljs.highlightElement(modalContent);
        }

        modal.classList.remove("hidden");
      } catch (err) {
        alert(err.message + ":\n" + path);
      }
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) {
      modal.classList.add("hidden");
    }
  });

  initScrubber();
}

function initScrubber() {
  const track = document.getElementById("timeline-track");
  if (!track) return;
  const thumb = document.getElementById("timeline-thumb");
  const label = document.getElementById("timeline-label");
  const scrollContainer = document.getElementById("transcript-container");

  if (!scrollContainer) return;

  let isDragging = false;
  let isTicking = false;

  // Use IntersectionObserver to update label efficiently without getBoundingClientRect
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const card = entry.target;
          if (card.dataset.time) {
            label.innerText = card.dataset.time;
          }
        }
      });
    },
    {
      root: scrollContainer,
      rootMargin: "-10% 0px -80% 0px", // Detect cards near the top 10%-20% of the container
      threshold: 0,
    }
  );

  // Watch for new step-cards being added to the DOM and observe them
  const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          if (node.classList.contains("step-card")) {
            observer.observe(node);
          }
          node
            .querySelectorAll(".step-card")
            .forEach((card) => observer.observe(card));
        }
      });
    });
  });
  mutationObserver.observe(scrollContainer, { childList: true, subtree: true });

  // Only update thumb position in the scroll event, greatly reducing layout thrashing
  function updateScrubberThumb() {
    if (isTicking) return;
    isTicking = true;

    window.requestAnimationFrame(() => {
      const scrollableHeight =
        scrollContainer.scrollHeight - scrollContainer.clientHeight;
      if (scrollableHeight <= 0) {
        thumb.style.top = "0px";
        isTicking = false;
        return;
      }

      const scrollPerc = scrollContainer.scrollTop / scrollableHeight;
      const trackHeight = track.clientHeight;
      const thumbHeight = thumb.clientHeight;

      const maxTop = trackHeight - thumbHeight;
      thumb.style.top = scrollPerc * maxTop + "px";

      isTicking = false;
    });
  }

  function scrollToTrackPosition(clientY) {
    const rect = track.getBoundingClientRect();
    let y = clientY - rect.top;
    y = Math.max(0, Math.min(y, rect.height));

    const perc = y / rect.height;
    const scrollableHeight =
      scrollContainer.scrollHeight - scrollContainer.clientHeight;
    scrollContainer.scrollTo(0, perc * scrollableHeight);
  }

  track.addEventListener("mousedown", (e) => {
    isDragging = true;
    track.classList.add("active");
    e.preventDefault(); // Prevent text selection
    scrollToTrackPosition(e.clientY);
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    e.preventDefault();
    scrollToTrackPosition(e.clientY);
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
    track.classList.remove("active");
  });

  scrollContainer.addEventListener("scroll", updateScrubberThumb);
  setTimeout(updateScrubberThumb, 500);
  window.addEventListener("transcriptLoaded", updateScrubberThumb);
}
