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
import io.micronaut.context.annotation.Value;
import io.micronaut.core.annotation.ReflectiveAccess;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.PathVariable;
import io.micronaut.http.annotation.QueryValue;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.micronaut.serde.annotation.Serdeable;
import jakarta.inject.Inject;
import jakarta.inject.Named;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Controller("/api/analysis")
public class AnalysisController {

    private static final int MAX_SAFE_TRANSCRIPT_CHARS = 2_000_000;
    private static final Pattern EXIT_CODE_PATTERN = Pattern.compile(
        "exited with code:?\\s*(\\d+)"
    );

    private static String cleanArg(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return "";
        String s = node.asText("").trim();
        if (s.startsWith("\"") && s.endsWith("\"") && s.length() >= 2) {
            s = s.substring(1, s.length() - 1).trim();
        }
        return s;
    }

    private Path getBrainPath(String flavor) {
        if (flavor == null || flavor.isEmpty()) flavor = "antigravity-cli";
        return Paths.get(System.getProperty("user.home"), ".gemini", flavor, "brain");
    }

    private static final Map<String, ProgressState> progressMap = new ConcurrentHashMap<>();

    @ReflectiveAccess
    @Serdeable
    public record ProgressState(int progress, String phase) {}

    @Get(value = "/conversations/{id}/progress", produces = "application/json")
    public ProgressResponse getProgress(@PathVariable String id) {
        ProgressState state = progressMap.get(id);
        if (state == null) {
            return new ProgressResponse("", -1);
        }
        return new ProgressResponse(state.phase(), state.progress());
    }

    @ReflectiveAccess
    @Serdeable
    public record ProgressResponse(String phase, int progress) {}

    private final AnalyzerService analyzerService;
    private final ExecutorService executor;

    @Value("${gemini.model:gemini-3.8-flash}")
    protected String modelName;

    @Inject
    public AnalysisController(
        AnalyzerService analyzerService,
        @Named(TaskExecutors.IO) ExecutorService executor
    ) {
        this.analyzerService = analyzerService;
        this.executor = executor;
    }

    private static final Map<String, Object> runningTasks = new ConcurrentHashMap<>();

    @ExecuteOn(TaskExecutors.IO)
    @Get(value = "/conversations/{id}/summarize", produces = "application/json")
    public String summarizeConversation(
        @PathVariable String id,
        @QueryValue Optional<Boolean> force,
        @QueryValue Optional<String> flavor
    ) throws IOException {
        String apiKey = System.getenv("GEMINI_API_KEY");
        if (apiKey == null || apiKey.isEmpty()) {
            return "{\"summary\": \"Error: GEMINI_API_KEY environment variable is not set. Cannot use LangChain4j analysis.\"}";
        }

        if (runningTasks.putIfAbsent(id, new Object()) != null) {
            return "{\"summary\": \"Analysis is already running in the background for this conversation. Please wait a moment and refresh.\"}";
        }

        try {
            Path brainPath = getBrainPath(flavor.orElse("antigravity-cli"));
            Path transcriptPath = brainPath
                .resolve(id)
                .resolve(".system_generated")
                .resolve("logs")
                .resolve("transcript.jsonl");
            if (!Files.exists(transcriptPath)) {
                return "{\"summary\": \"No transcript found.\"}";
            }

            boolean forceRecompute = force.orElse(false);
            Path summaryJsonPath = brainPath
                .resolve(id)
                .resolve(".system_generated")
                .resolve("logs")
                .resolve("summary.json");
            Path shortTitlePath = brainPath
                .resolve(id)
                .resolve(".system_generated")
                .resolve("logs")
                .resolve("short_title.txt");

            if (!forceRecompute && Files.exists(summaryJsonPath)) {
                return Files.readString(summaryJsonPath);
            } else if (forceRecompute) {
                Files.deleteIfExists(summaryJsonPath);
            }

            ObjectMapper mapper = new ObjectMapper();
            progressMap.put(id, new ProgressState(10, "Extracting conversation context..."));

            try {
                List<String> allLines = Files.readAllLines(transcriptPath);
                List<List<String>> sequences = new ArrayList<>();
                List<String> currentSequence = new ArrayList<>();

                for (String line : allLines) {
                    if (line.trim().isEmpty()) continue;
                    try {
                        JsonNode node = mapper.readTree(line);
                        String type = node.path("type").asText("");
                        String source = node.path("source").asText("");
                        String status = node.path("status").asText("");
                        String content = node.path("content").asText("");

                        if ("USER_INPUT".equals(type) || "USER_EXPLICIT".equals(source)) {
                            if (!currentSequence.isEmpty()) {
                                sequences.add(deduplicateSequence(currentSequence));
                                currentSequence = new ArrayList<>();
                            }
                            currentSequence.add(
                                "USER REQUEST: " +
                                content.substring(0, Math.min(4000, content.length())).trim()
                            );
                        } else if ("PLANNER_RESPONSE".equals(type) || "MESSAGE".equals(type)) {
                            JsonNode tools = node.path("tool_calls");
                            if (!tools.isMissingNode() && tools.isArray() && tools.size() > 0) {
                                for (JsonNode tool : tools) {
                                    String name = tool.path("name").asText("unknown");
                                    JsonNode args = tool.has("args")
                                        ? tool.path("args")
                                        : tool.path("arguments");

                                    String action = cleanArg(args.path("toolAction"));
                                    if (action.isEmpty()) action =
                                        cleanArg(args.path("Description"));
                                    if (action.isEmpty()) action =
                                        cleanArg(args.path("Instruction"));
                                    if (action.isEmpty()) action =
                                        cleanArg(args.path("toolSummary"));
                                    if (action.isEmpty()) action = cleanArg(args.path("Prompt"));

                                    String tgt = cleanArg(args.path("TargetFile"));
                                    if (tgt.isEmpty()) tgt = cleanArg(args.path("CommandLine"));
                                    if (tgt.isEmpty()) tgt = cleanArg(args.path("AbsolutePath"));
                                    if (tgt.isEmpty()) tgt = cleanArg(args.path("Query"));
                                    if (tgt.isEmpty()) tgt = cleanArg(args.path("Pattern"));
                                    if (tgt.isEmpty()) tgt = cleanArg(args.path("DirectoryPath"));
                                    if (tgt.isEmpty()) tgt = cleanArg(args.path("Url"));
                                    if (tgt.isEmpty()) tgt = cleanArg(args.path("TaskId"));

                                    if (action.isEmpty() && tgt.isEmpty()) {
                                        currentSequence.add("AGENT ACTION: [" + name + "]");
                                    } else if (action.isEmpty()) {
                                        currentSequence.add("AGENT ACTION: [" + name + "] " + tgt);
                                    } else if (tgt.isEmpty()) {
                                        currentSequence.add(
                                            "AGENT ACTION: [" + name + "] " + action
                                        );
                                    } else {
                                        currentSequence.add(
                                            "AGENT ACTION: [" + name + "] " + action + " -> " + tgt
                                        );
                                    }
                                }
                            }
                            String text = content.trim();
                            if (!text.isEmpty()) {
                                currentSequence.add(
                                    "AGENT RESPONSE: " +
                                    text.substring(0, Math.min(2000, text.length()))
                                );
                            }
                        } else {
                            boolean isFailure = false;
                            if (
                                "ERROR".equals(status) ||
                                "ERROR_MESSAGE".equals(type) ||
                                node.has("error")
                            ) {
                                isFailure = true;
                            } else if (content.contains("The command failed")) {
                                isFailure = true;
                            } else {
                                Matcher m = EXIT_CODE_PATTERN.matcher(content);
                                if (m.find() && !"0".equals(m.group(1))) {
                                    isFailure = true;
                                } else if (
                                    content.contains("Exception") &&
                                    !"PLANNER_RESPONSE".equals(type)
                                ) {
                                    isFailure = true;
                                }
                            }

                            if (isFailure) {
                                String[] errLines = content.split("\n");
                                List<String> cleanLines = new ArrayList<>();
                                for (String l : errLines) {
                                    String trimmed = l.trim();
                                    if (
                                        trimmed.isEmpty() ||
                                        trimmed.startsWith("Created At:") ||
                                        trimmed.startsWith("Completed At:")
                                    ) {
                                        continue;
                                    }
                                    cleanLines.add(trimmed);
                                    if (cleanLines.size() >= 4) break;
                                }
                                String errSnippet = String.join(" | ", cleanLines);
                                if (!errSnippet.isEmpty()) {
                                    currentSequence.add(
                                        "TOOL FAILURE: " +
                                        errSnippet.substring(0, Math.min(500, errSnippet.length()))
                                    );
                                }
                            } else if ("RUN_COMMAND".equals(type) || "GENERIC".equals(type)) {
                                if (
                                    content.contains("BUILD SUCCESSFUL") ||
                                    content.contains("tests passed") ||
                                    content.contains("Tests run:") ||
                                    content.contains("0 errors")
                                ) {
                                    String[] outLines = content.split("\n");
                                    for (String l : outLines) {
                                        String trimmed = l.trim();
                                        if (
                                            trimmed.contains("BUILD SUCCESSFUL") ||
                                            trimmed.contains("tests passed") ||
                                            trimmed.contains("Tests run:") ||
                                            trimmed.contains("0 errors")
                                        ) {
                                            currentSequence.add(
                                                "TOOL RESULT: " +
                                                trimmed.substring(
                                                    0,
                                                    Math.min(200, trimmed.length())
                                                )
                                            );
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    } catch (Exception e) {
                        // skip malformed lines
                    }
                }
                if (!currentSequence.isEmpty()) {
                    sequences.add(deduplicateSequence(currentSequence));
                }

                List<String> combinedLines = new ArrayList<>();
                for (List<String> seq : sequences) {
                    combinedLines.addAll(seq);
                }

                if (combinedLines.isEmpty()) {
                    return "{\"summary\": \"No transcript lines found.\"}";
                }

                String transcript = String.join("\n", combinedLines);

                // Safety guardrail for massive autonomous multi-day sessions (>2M chars / ~500k tokens)
                if (transcript.length() > MAX_SAFE_TRANSCRIPT_CHARS) {
                    transcript =
                        transcript.substring(0, 1_000_000) +
                        "\n\n... [intermediate steps pruned for length] ...\n\n" +
                        transcript.substring(transcript.length() - 1_000_000);
                }

                progressMap.put(id, new ProgressState(25, "Analyzing conversation with Gemini..."));

                // Smooth progress ticker while waiting for Gemini 3.8 Flash response
                AtomicBoolean analysisDone = new AtomicBoolean(false);
                Future<?> progressTicker = executor.submit(() -> {
                    int p = 25;
                    while (!analysisDone.get() && p < 95) {
                        try {
                            Thread.sleep(1000);
                        } catch (InterruptedException e) {
                            break;
                        }
                        if (!analysisDone.get()) {
                            p = Math.min(95, p + 5);
                            progressMap.put(
                                id,
                                new ProgressState(p, "Analyzing conversation with Gemini...")
                            );
                        }
                    }
                });

                AnalysisResponse responseObj;
                try {
                    responseObj = analyzerService.analyze(transcript);
                } finally {
                    analysisDone.set(true);
                    progressTicker.cancel(true);
                }

                progressMap.put(id, new ProgressState(100, "Done"));

                String jsonResponse = mapper.writeValueAsString(responseObj);

                // Cache shortTitle
                try {
                    String title = responseObj.shortTitle();
                    if (title != null && !title.isEmpty()) {
                        Files.writeString(shortTitlePath, title.trim());
                    }
                } catch (Exception e) {}

                // Cache summary.json
                Files.writeString(summaryJsonPath, jsonResponse);
                return jsonResponse;
            } catch (Exception e) {
                System.err.println("Exception caught during analysis:");
                e.printStackTrace();
                try {
                    return mapper.writeValueAsString(
                        Map.of("summary", "Error generating summary: " + e.getMessage())
                    );
                } catch (Exception ex) {
                    return "{\"summary\": \"Error generating summary: Unknown error\"}";
                }
            } finally {
                progressMap.remove(id);
            }
        } finally {
            runningTasks.remove(id);
        }
    }

    private List<String> deduplicateSequence(List<String> sequence) {
        if (sequence.isEmpty()) return sequence;
        List<String> deduped = new ArrayList<>();
        String lastLine = null;
        int count = 0;
        for (String line : sequence) {
            if (line.equals(lastLine)) {
                count++;
            } else {
                if (count > 1) {
                    deduped.set(deduped.size() - 1, lastLine + " (repeated " + count + " times)");
                }
                deduped.add(line);
                lastLine = line;
                count = 1;
            }
        }
        if (count > 1) {
            deduped.set(deduped.size() - 1, lastLine + " (repeated " + count + " times)");
        }
        return deduped;
    }
}
