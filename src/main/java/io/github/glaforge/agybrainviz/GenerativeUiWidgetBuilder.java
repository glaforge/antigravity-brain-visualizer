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
package io.github.glaforge.agybrainviz;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Singleton
public class GenerativeUiWidgetBuilder {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Pattern COMPLETED_AT_PATTERN = Pattern.compile(
        "Completed At:\\s*([^\\n]+)"
    );
    private static final Pattern USER_REQUEST_OPEN = Pattern.compile("(?s).*?<USER_REQUEST>\\s*");
    private static final Pattern XML_TAG_PATTERN = Pattern.compile("<[^>]+>");

    public record SequenceStat(
        int index,
        long startMs,
        long endMs,
        int steps,
        int errors,
        String promptPreview
    ) {}

    public String buildWidgetHtml(
        String conversationId,
        String title,
        String status,
        String projectName,
        Path convDir,
        Path transcriptPath
    ) throws IOException {
        List<String> lines = Files.readAllLines(transcriptPath);

        int totalSteps = 0;
        int userQueries = 0;
        int toolsCalled = 0;
        int modelResponses = 0;
        int errors = 0;
        long inputTokens = 0;
        long thinkingTokens = 0;
        long outputTokens = 0;

        Map<String, Integer> toolFrequencies = new HashMap<>();
        List<SequenceStat> sequences = new ArrayList<>();

        int currentSeqIdx = 0;
        long seqStart = 0L;
        long seqEnd = 0L;
        int seqSteps = 0;
        int seqErrors = 0;
        String seqPrompt = "Session Initialization";

        for (String rawLine : lines) {
            String line = rawLine.trim();
            if (line.isEmpty()) {
                continue;
            }
            JsonNode step;
            try {
                step = MAPPER.readTree(line);
            } catch (Exception e) {
                continue;
            }
            totalSteps++;

            String source = step.path("source").asText("");
            String type = step.path("type").asText("");
            String stepStatus = step.path("status").asText("");
            String content = step.path("content").asText("");
            String thinking = step.path("thinking").asText("");
            String createdAt = step.path("created_at").asText("");

            long stepStartMs = parseIsoMillis(createdAt);
            long stepEndMs = extractEndTimeMs(content, stepStartMs);

            boolean isUserStep = "USER_EXPLICIT".equals(source) || "USER_INPUT".equals(type);
            boolean isErrorStep =
                "ERROR".equals(stepStatus) ||
                "ERROR_MESSAGE".equals(type) ||
                ("RUN_COMMAND".equals(type) && content.contains("The command failed"));

            if (isUserStep) {
                userQueries++;
                if (seqSteps > 0) {
                    sequences.add(
                        new SequenceStat(
                            currentSeqIdx,
                            seqStart,
                            seqEnd,
                            seqSteps,
                            seqErrors,
                            seqPrompt
                        )
                    );
                }
                currentSeqIdx++;
                seqStart = stepStartMs;
                seqEnd = stepEndMs;
                seqSteps = 1;
                seqErrors = isErrorStep ? 1 : 0;
                seqPrompt = cleanPromptPreview(content);
            } else {
                if (seqSteps == 0) {
                    currentSeqIdx = 1;
                    seqStart = stepStartMs;
                    seqEnd = stepEndMs;
                } else {
                    if (seqStart == 0L && stepStartMs > 0L) {
                        seqStart = stepStartMs;
                    }
                    seqEnd = Math.max(seqEnd, stepEndMs);
                }
                seqSteps++;
                if (isErrorStep) {
                    seqErrors++;
                }
            }

            if (isErrorStep) {
                errors++;
            }

            JsonNode toolCalls = step.path("tool_calls");
            if (toolCalls.isArray() && !toolCalls.isEmpty()) {
                toolsCalled += toolCalls.size();
                for (JsonNode tc : toolCalls) {
                    String tName = tc.path("name").asText("");
                    if (tName.isEmpty()) {
                        tName = tc.path("function").path("name").asText("unknown_tool");
                    }
                    toolFrequencies.put(tName, toolFrequencies.getOrDefault(tName, 0) + 1);
                }
            } else if (
                type.contains("TOOL") || type.contains("VIEW_FILE") || type.contains("COMMAND")
            ) {
                toolsCalled++;
            }

            if (
                "MODEL".equals(source) &&
                ("PLANNER_RESPONSE".equals(type) || "MESSAGE".equals(type)) &&
                !content.isEmpty() &&
                (!toolCalls.isArray() || toolCalls.isEmpty())
            ) {
                modelResponses++;
            }

            // Token estimation (~4 chars/token heuristic)
            if (isUserStep) {
                inputTokens += (content.length() + 3L) / 4L;
            } else if (
                "MODEL".equals(source) &&
                ("PLANNER_RESPONSE".equals(type) || "MESSAGE".equals(type))
            ) {
                if (!content.isEmpty()) {
                    outputTokens += (content.length() + 3L) / 4L;
                }
                if (toolCalls.isArray()) {
                    for (JsonNode tc : toolCalls) {
                        JsonNode argsNode = tc.has("args") ? tc.path("args") : tc.path("arguments");
                        String argsStr = argsNode.isMissingNode() ? "{}" : argsNode.toString();
                        outputTokens += (argsStr.length() + 3L) / 4L;
                    }
                }
            } else if (!content.isEmpty()) {
                inputTokens += (content.length() + 3L) / 4L;
            }
            if (!thinking.isEmpty()) {
                thinkingTokens += (thinking.length() + 3L) / 4L;
            }
        }

        if (seqSteps > 0) {
            sequences.add(
                new SequenceStat(currentSeqIdx, seqStart, seqEnd, seqSteps, seqErrors, seqPrompt)
            );
        }

        long totalTokens = inputTokens + thinkingTokens + outputTokens;
        double estimatedCost =
            (inputTokens * 0.75 + (outputTokens + thinkingTokens) * 3.75) / 1_000_000.0;
        String costStr = estimatedCost < 0.005
            ? "< $0.01"
            : String.format(Locale.US, "$%.3f", estimatedCost);

        long firstStart = sequences.isEmpty() ? 0L : sequences.getFirst().startMs();
        long lastEnd = sequences.isEmpty() ? 0L : sequences.getLast().endMs();
        long totalWallMs = Math.max(0L, lastEnd - firstStart);
        String durationStr = formatDurationMs(totalWallMs);

        // Sort top 5 tools
        List<Map.Entry<String, Integer>> topTools = toolFrequencies
            .entrySet()
            .stream()
            .sorted((a, b) -> Integer.compare(b.getValue(), a.getValue()))
            .limit(5)
            .toList();

        // Check cached summary.json
        Path summaryPath = convDir.resolve(".system_generated/logs/summary.json");
        JsonNode analysisNode = null;
        if (Files.exists(summaryPath)) {
            try {
                analysisNode = MAPPER.readTree(Files.readString(summaryPath));
            } catch (Exception ignored) {}
        }

        return renderHtmlDocument(
            conversationId,
            title,
            status,
            projectName,
            totalSteps,
            userQueries,
            toolsCalled,
            modelResponses,
            errors,
            inputTokens,
            thinkingTokens,
            outputTokens,
            totalTokens,
            costStr,
            durationStr,
            totalWallMs,
            firstStart,
            sequences,
            topTools,
            analysisNode
        );
    }

    private String renderHtmlDocument(
        String conversationId,
        String title,
        String status,
        String projectName,
        int totalSteps,
        int userQueries,
        int toolsCalled,
        int modelResponses,
        int errors,
        long inputTokens,
        long thinkingTokens,
        long outputTokens,
        long totalTokens,
        String costStr,
        String durationStr,
        long totalWallMs,
        long firstStart,
        List<SequenceStat> sequences,
        List<Map.Entry<String, Integer>> topTools,
        JsonNode analysisNode
    ) {
        double inPct = totalTokens > 0 ? Math.max(1.0, (inputTokens * 100.0) / totalTokens) : 33.3;
        double thPct = totalTokens > 0
            ? Math.max(1.0, (thinkingTokens * 100.0) / totalTokens)
            : 33.3;
        double outPct = totalTokens > 0
            ? Math.max(1.0, (outputTokens * 100.0) / totalTokens)
            : 33.4;

        String shortId = conversationId.length() > 8
            ? conversationId.substring(0, 8)
            : conversationId;
        String outcomeBadge = errors == 0
            ? "<span class=\"px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30\">✓ Succeeded</span>"
            : "<span class=\"px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30\">⚠ " +
            errors +
            " Issue" +
            (errors == 1 ? "" : "s") +
            "</span>";

        // Build top tools HTML
        StringBuilder toolsHtml = new StringBuilder();
        if (topTools.isEmpty()) {
            toolsHtml.append(
                "<div class=\"text-xs text-[var(--muted-foreground)]\">No tool invocations recorded.</div>"
            );
        } else {
            int maxToolCount = topTools.getFirst().getValue();
            for (Map.Entry<String, Integer> entry : topTools) {
                double widthPct = Math.max(4.0, (entry.getValue() * 100.0) / maxToolCount);
                toolsHtml
                    .append("<div class=\"flex items-center gap-2 text-xs\">")
                    .append(
                        "<span class=\"w-36 truncate font-mono text-[var(--foreground)]\" title=\""
                    )
                    .append(escapeHtml(entry.getKey()))
                    .append("\">")
                    .append(escapeHtml(entry.getKey()))
                    .append("</span>")
                    .append(
                        "<div class=\"flex-1 h-2 rounded-full bg-[var(--secondary)] overflow-hidden\">"
                    )
                    .append("<div class=\"h-full rounded-full bg-violet-500\" style=\"width:")
                    .append(String.format(Locale.US, "%.1f", widthPct))
                    .append("%\"></div></div>")
                    .append(
                        "<span class=\"w-8 text-right font-semibold text-[var(--muted-foreground)]\">"
                    )
                    .append(entry.getValue())
                    .append("</span></div>");
            }
        }

        // Build timeline bar & sequence list HTML
        StringBuilder timelineBarHtml = new StringBuilder();
        if (sequences.isEmpty() || totalWallMs <= 0) {
            timelineBarHtml.append("<div class=\"h-full w-full bg-amber-500/70\"></div>");
        } else {
            for (SequenceStat seq : sequences) {
                long segStart = Math.max(0L, seq.startMs() - firstStart);
                long segDur = Math.max(1000L, seq.endMs() - seq.startMs());
                double leftPct = Math.min(98.0, (segStart * 100.0) / totalWallMs);
                double widthPct = Math.max(
                    1.5,
                    Math.min(100.0 - leftPct, (segDur * 100.0) / totalWallMs)
                );
                String colorClass = seq.errors() > 0 ? "bg-red-500" : "bg-amber-500";
                timelineBarHtml
                    .append("<div class=\"absolute top-0 bottom-0 ")
                    .append(colorClass)
                    .append(" opacity-85 hover:opacity-100 transition-opacity\" style=\"left:")
                    .append(String.format(Locale.US, "%.2f", leftPct))
                    .append("%;width:")
                    .append(String.format(Locale.US, "%.2f", widthPct))
                    .append("%;\" title=\"Sequence #")
                    .append(seq.index())
                    .append(" (")
                    .append(formatDurationMs(seq.endMs() - seq.startMs()))
                    .append(")\"></div>");
            }
        }

        StringBuilder seqListHtml = new StringBuilder();
        for (SequenceStat seq : sequences) {
            String seqDur = formatDurationMs(Math.max(0L, seq.endMs() - seq.startMs()));
            seqListHtml
                .append(
                    "<div class=\"flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs\">"
                )
                .append("<div class=\"flex items-center gap-2 min-w-0 flex-1\">")
                .append("<span class=\"font-mono font-semibold text-amber-400 shrink-0\">#")
                .append(seq.index())
                .append("</span>")
                .append("<span class=\"truncate text-[var(--foreground)]\" title=\"")
                .append(escapeHtml(seq.promptPreview()))
                .append("\">")
                .append(escapeHtml(seq.promptPreview()))
                .append("</span></div>")
                .append("<div class=\"flex items-center gap-2 shrink-0\">");
            if (seq.errors() > 0) {
                seqListHtml
                    .append(
                        "<span class=\"px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-medium\">"
                    )
                    .append(seq.errors())
                    .append(" err</span>");
            }
            seqListHtml
                .append("<span class=\"text-[var(--muted-foreground)]\">")
                .append(seq.steps())
                .append(" steps</span>")
                .append("<span class=\"font-mono text-[var(--foreground)] font-medium\">")
                .append(seqDur)
                .append("</span></div></div>");
        }

        // Build AI Analysis HTML
        StringBuilder analysisHtml = new StringBuilder();
        if (analysisNode != null && analysisNode.has("summary")) {
            String summaryText = analysisNode.path("summary").asText("");
            analysisHtml
                .append("<p class=\"text-xs leading-relaxed text-[var(--foreground)] mb-3\">")
                .append(escapeHtml(summaryText))
                .append("</p>");

            JsonNode issues = analysisNode.path("issues");
            if (issues.isArray() && !issues.isEmpty()) {
                analysisHtml.append(
                    "<div class=\"text-xs font-semibold text-red-400 uppercase tracking-wider mb-1.5\">Issues & Circumventions</div>"
                );
                analysisHtml.append("<div class=\"space-y-1.5 mb-3\">");
                for (JsonNode issue : issues) {
                    analysisHtml
                        .append(
                            "<div class=\"p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs\">"
                        )
                        .append("<div class=\"font-medium text-red-300\">⚠ ")
                        .append(escapeHtml(issue.path("error").asText("")))
                        .append("</div>");
                    String circ = issue.path("circumvention").asText("");
                    if (!circ.isEmpty() && !"null".equalsIgnoreCase(circ)) {
                        analysisHtml
                            .append("<div class=\"text-[var(--muted-foreground)] mt-0.5\">↳ ")
                            .append(escapeHtml(circ))
                            .append("</div>");
                    }
                    analysisHtml.append("</div>");
                }
                analysisHtml.append("</div>");
            }

            JsonNode recs = analysisNode.path("recommendations");
            if (recs.isArray() && !recs.isEmpty()) {
                analysisHtml.append(
                    "<div class=\"text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1.5\">Recommendations</div>"
                );
                analysisHtml.append("<div class=\"space-y-1\">");
                for (JsonNode rec : recs) {
                    analysisHtml
                        .append(
                            "<div class=\"p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-[var(--foreground)]\">💡 "
                        )
                        .append(escapeHtml(rec.asText("")))
                        .append("</div>");
                }
                analysisHtml.append("</div>");
            }
        } else {
            analysisHtml.append(
                "<div class=\"p-4 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs text-[var(--muted-foreground)] text-center\">" +
                "No cached AI analysis found in <code class=\"font-mono\">summary.json</code> yet. " +
                "Open the <strong>Antigravity Brain Visualizer</strong> side pane to compute the Gemini session summary." +
                "</div>"
            );
        }

        String projectBadge = (projectName != null && !projectName.isBlank())
            ? "<span class=\"px-2 py-0.5 rounded text-xs bg-[var(--secondary)] text-[var(--muted-foreground)] border border-[var(--border)]\">📦 " +
            escapeHtml(projectName) +
            "</span>"
            : "";

        return """
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
            </head>
            <body class="bg-transparent text-[var(--foreground)] antialiased p-3">
              <div class="bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-xl p-4 shadow-sm space-y-3">
                <!-- Header -->
                <div class="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-sm font-semibold text-[var(--foreground)] truncate">%s</span>
                      <span class="font-mono text-xs px-1.5 py-0.5 rounded bg-[var(--secondary)] text-[var(--muted-foreground)]">%s</span>
                      %s
                    </div>
                    <div class="flex items-center gap-3 mt-1 text-xs text-[var(--muted-foreground)]">
                      <span>⏱ %s</span>
                      <span>•</span>
                      <span>%d steps (%d sequences)</span>
                      <span>•</span>
                      <span>Est. Cost: <strong class="text-emerald-400">%s</strong></span>
                    </div>
                  </div>
                  <div class="shrink-0 flex items-center gap-2">
                    %s
                  </div>
                </div>

                <!-- Tabs -->
                <div class="flex items-center gap-1.5 border-b border-[var(--border)] pb-2">
                  <button onclick="switchTab('overview')" id="tab-btn-overview" class="px-3 py-1 rounded-lg text-xs font-medium bg-[var(--primary)] text-[var(--primary-foreground)] transition-colors">
                    📊 Overview &amp; Tokens
                  </button>
                  <button onclick="switchTab('timeline')" id="tab-btn-timeline" class="px-3 py-1 rounded-lg text-xs font-medium bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
                    ⏱ Timeline (%d)
                  </button>
                  <button onclick="switchTab('analysis')" id="tab-btn-analysis" class="px-3 py-1 rounded-lg text-xs font-medium bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
                    ✨ AI Analysis
                  </button>
                </div>

                <!-- Tab 1: Overview & Tokens -->
                <div id="tab-panel-overview" class="space-y-3">
                  <div class="grid grid-cols-4 gap-2">
                    <div class="p-2.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)]">
                      <div class="text-xs text-[var(--muted-foreground)]">User Queries</div>
                      <div class="text-base font-bold text-[var(--foreground)] mt-0.5">%d</div>
                    </div>
                    <div class="p-2.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)]">
                      <div class="text-xs text-[var(--muted-foreground)]">Tools Called</div>
                      <div class="text-base font-bold text-violet-400 mt-0.5">%d</div>
                    </div>
                    <div class="p-2.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)]">
                      <div class="text-xs text-[var(--muted-foreground)]">Model Replies</div>
                      <div class="text-base font-bold text-sky-400 mt-0.5">%d</div>
                    </div>
                    <div class="p-2.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)]">
                      <div class="text-xs text-[var(--muted-foreground)]">Est. Tokens</div>
                      <div class="text-base font-bold text-emerald-400 mt-0.5">%s</div>
                    </div>
                  </div>

                  <!-- Token Distribution Bar -->
                  <div class="p-3 rounded-lg bg-[var(--secondary)] border border-[var(--border)] space-y-2">
                    <div class="flex items-center justify-between text-xs">
                      <span class="font-semibold text-[var(--foreground)]">Token Distribution (Heuristic ~4 chars/tok)</span>
                      <span class="text-[var(--muted-foreground)]">Total: <strong class="text-[var(--foreground)]">%s</strong></span>
                    </div>
                    <div class="h-3 w-full rounded-full overflow-hidden flex bg-[var(--background)]">
                      <div style="width:%.1f%%" class="bg-sky-400 h-full" title="Input Tokens"></div>
                      <div style="width:%.1f%%" class="bg-violet-400 h-full" title="Thinking Tokens"></div>
                      <div style="width:%.1f%%" class="bg-emerald-400 h-full" title="Output Tokens"></div>
                    </div>
                    <div class="flex items-center justify-between text-xs text-[var(--muted-foreground)] flex-wrap gap-2">
                      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block"></span>Input: <strong class="text-[var(--foreground)]">%s</strong> (%.0f%%)</span>
                      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-violet-400 inline-block"></span>Thinking: <strong class="text-[var(--foreground)]">%s</strong> (%.0f%%)</span>
                      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span>Output: <strong class="text-[var(--foreground)]">%s</strong> (%.0f%%)</span>
                    </div>
                  </div>

                  <!-- Top Tools -->
                  <div class="space-y-1.5">
                    <div class="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Top Tools Invoked</div>
                    <div class="space-y-1">
                      %s
                    </div>
                  </div>
                </div>

                <!-- Tab 2: Timeline & Sequences -->
                <div id="tab-panel-timeline" class="hidden space-y-3">
                  <div class="space-y-1">
                    <div class="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                      <span>Proportional Session Activity</span>
                      <span>Wall Duration: <strong class="text-[var(--foreground)]">%s</strong></span>
                    </div>
                    <div class="relative h-5 w-full rounded-lg bg-[var(--secondary)] border border-[var(--border)] overflow-hidden">
                      %s
                    </div>
                  </div>
                  <div class="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    %s
                  </div>
                </div>

                <!-- Tab 3: AI Analysis -->
                <div id="tab-panel-analysis" class="hidden max-h-60 overflow-y-auto pr-1">
                  %s
                </div>
              </div>

              <script>
                function switchTab(tab) {
                  ['overview', 'timeline', 'analysis'].forEach(function(t) {
                    var panel = document.getElementById('tab-panel-' + t);
                    var btn = document.getElementById('tab-btn-' + t);
                    if (t === tab) {
                      panel.classList.remove('hidden');
                      btn.className = 'px-3 py-1 rounded-lg text-xs font-medium bg-[var(--primary)] text-[var(--primary-foreground)] transition-colors';
                    } else {
                      panel.classList.add('hidden');
                      btn.className = 'px-3 py-1 rounded-lg text-xs font-medium bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors';
                    }
                  });
                }
              </script>
            </body>
            </html>
            """.formatted(
                escapeHtml(title),
                escapeHtml(shortId),
                projectBadge,
                escapeHtml(durationStr),
                totalSteps,
                sequences.size(),
                escapeHtml(costStr),
                outcomeBadge,
                sequences.size(),
                userQueries,
                toolsCalled,
                modelResponses,
                formatTokens(totalTokens),
                formatTokens(totalTokens),
                inPct,
                thPct,
                outPct,
                formatTokens(inputTokens),
                inPct,
                formatTokens(thinkingTokens),
                thPct,
                formatTokens(outputTokens),
                outPct,
                toolsHtml.toString(),
                escapeHtml(durationStr),
                timelineBarHtml.toString(),
                seqListHtml.toString(),
                analysisHtml.toString()
            );
    }

    private static long parseIsoMillis(String ts) {
        if (ts == null || ts.isBlank()) {
            return 0L;
        }
        try {
            return Instant.parse(ts.trim()).toEpochMilli();
        } catch (Exception e) {
            return 0L;
        }
    }

    private static long extractEndTimeMs(String content, long defaultStartMs) {
        if (content == null || content.isEmpty()) {
            return defaultStartMs;
        }
        Matcher m = COMPLETED_AT_PATTERN.matcher(content);
        if (m.find()) {
            long parsed = parseIsoMillis(m.group(1));
            if (parsed > defaultStartMs) {
                return parsed;
            }
        }
        return defaultStartMs;
    }

    private static String cleanPromptPreview(String raw) {
        if (raw == null || raw.isBlank()) {
            return "User Request";
        }
        String s = USER_REQUEST_OPEN.matcher(raw).replaceFirst("");
        int endIdx = s.indexOf("</USER_REQUEST>");
        if (endIdx != -1) {
            s = s.substring(0, endIdx);
        }
        s = XML_TAG_PATTERN.matcher(s).replaceAll(" ").replaceAll("\\s+", " ").trim();
        if (s.isEmpty()) {
            return "User Request";
        }
        return s.length() > 90 ? s.substring(0, 90) + "..." : s;
    }

    private static String formatTokens(long t) {
        if (t >= 1_000_000L) {
            return String.format(Locale.US, "%.2fM", t / 1_000_000.0);
        }
        if (t >= 1_000L) {
            return String.format(Locale.US, "%.1fk", t / 1_000.0);
        }
        return Long.toString(t);
    }

    private static String formatDurationMs(long ms) {
        long secs = Math.max(0L, ms / 1000L);
        long mins = secs / 60L;
        long hrs = mins / 60L;
        if (hrs > 0) {
            return hrs + "h " + (mins % 60L) + "m";
        }
        if (mins > 0) {
            return mins + "m " + (secs % 60L) + "s";
        }
        return secs + "s";
    }

    private static String escapeHtml(String input) {
        if (input == null) {
            return "";
        }
        return input
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&#039;");
    }
}
