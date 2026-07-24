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
import io.micronaut.core.annotation.ReflectiveAccess;
import io.micronaut.http.annotation.Body;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Post;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.micronaut.serde.annotation.Serdeable;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

@Controller("/api/chat")
public class ChatController {

    private final ChatService chatService;
    private final ObjectMapper objectMapper;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
        this.objectMapper = new ObjectMapper();
    }

    private Path getBrainPath(String flavor) {
        if (flavor == null || flavor.isEmpty()) flavor = "antigravity-cli";
        return Paths.get(System.getProperty("user.home"), ".gemini", flavor, "brain");
    }

    @ReflectiveAccess
    @Serdeable
    public record ChatScope(String type, String targetId) {}

    @ReflectiveAccess
    @Serdeable
    public record ChatRequest(
        String flavor,
        String conversationId,
        ChatScope scope,
        String message
    ) {}

    @ReflectiveAccess
    @Serdeable
    public record ChatResponse(String answer, String contextScope) {}

    @ExecuteOn(TaskExecutors.IO)
    @Post
    public ChatResponse processChat(@Body ChatRequest request) {
        if (request.conversationId() == null || request.conversationId().isEmpty()) {
            return new ChatResponse("Please select an active session first.", "none");
        }

        String context = extractContext(request);
        String rawAnswer = chatService.ask(context, request.message());
        String answer = formatAnswer(rawAnswer);
        String scopeLabel = request.scope() != null && request.scope().type() != null
            ? request.scope().type()
            : "global";
        return new ChatResponse(answer, scopeLabel);
    }

    private String formatAnswer(String rawAnswer) {
        if (rawAnswer == null || rawAnswer.trim().isEmpty()) {
            return "";
        }
        String trimmed = rawAnswer.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
                JsonNode node = objectMapper.readTree(trimmed);
                StringBuilder sb = new StringBuilder();

                if (node.has("summary") && !node.get("summary").isNull()) {
                    sb.append(node.get("summary").asText()).append("\n\n");
                } else if (node.has("response") && !node.get("response").isNull()) {
                    sb.append(node.get("response").asText()).append("\n\n");
                }

                if (node.has("details") && !node.get("details").isNull()) {
                    JsonNode details = node.get("details");
                    if (details.isObject()) {
                        details
                            .fields()
                            .forEachRemaining(entry -> {
                                String key = entry.getKey().replace('_', ' ');
                                String capKey =
                                    Character.toUpperCase(key.charAt(0)) + key.substring(1);
                                sb
                                    .append("**")
                                    .append(capKey)
                                    .append("**: ")
                                    .append(entry.getValue().asText())
                                    .append("\n\n");
                            });
                    } else if (details.isTextual() && !details.asText().isEmpty()) {
                        sb.append(details.asText()).append("\n\n");
                    }
                }

                if (
                    node.has("skill") &&
                    !node.get("skill").isNull() &&
                    !node.get("skill").asText().isEmpty()
                ) {
                    sb
                        .append("```markdown\n")
                        .append(node.get("skill").asText())
                        .append("\n```\n\n");
                }

                String result = sb.toString().trim();
                if (!result.isEmpty()) {
                    return result;
                }
            } catch (Exception ignored) {}
        }
        return rawAnswer;
    }

    private String extractContext(ChatRequest request) {
        Path sessionDir = getBrainPath(request.flavor()).resolve(request.conversationId());
        Path transcriptPath = sessionDir.resolve(".system_generated/logs/transcript.jsonl");

        if (!Files.exists(transcriptPath)) {
            return "No transcript file found for conversation " + request.conversationId();
        }

        ChatScope scope = request.scope();
        String scopeType = scope != null && scope.type() != null ? scope.type() : "global";
        String targetId = scope != null && scope.targetId() != null ? scope.targetId() : "";

        try {
            List<String> lines = Files.readAllLines(transcriptPath);

            if ("analysis".equalsIgnoreCase(scopeType)) {
                Path summaryPath = sessionDir.resolve("summary.json");
                if (Files.exists(summaryPath)) {
                    return Files.readString(summaryPath);
                }
                return extractTruncatedTranscript(lines, 100);
            } else if ("sequence".equalsIgnoreCase(scopeType)) {
                return extractSequenceContext(lines, targetId);
            } else if ("step".equalsIgnoreCase(scopeType)) {
                return extractStepContext(lines, targetId);
            } else { // "global"
                return extractTruncatedTranscript(lines, 200);
            }
        } catch (IOException e) {
            return "Error reading transcript file: " + e.getMessage();
        }
    }

    private String extractSequenceContext(List<String> lines, String targetId) {
        int targetSeqNum = parseNumber(targetId, 1);
        int currentSeq = 0;
        List<String> seqLines = new ArrayList<>();

        for (String line : lines) {
            try {
                JsonNode node = objectMapper.readTree(line);
                String source = node.path("source").asText();
                String type = node.path("type").asText();
                if ("USER_EXPLICIT".equals(source) || "USER_INPUT".equals(type)) {
                    currentSeq++;
                }
                if (currentSeq == targetSeqNum) {
                    seqLines.add(line);
                } else if (currentSeq > targetSeqNum) {
                    break;
                }
            } catch (Exception ignored) {}
        }

        if (seqLines.isEmpty()) {
            return extractTruncatedTranscript(lines, 150);
        }

        return String.join("\n", seqLines);
    }

    private String extractStepContext(List<String> lines, String targetId) {
        int targetStepIndex = parseNumber(targetId, -1);
        if (targetStepIndex >= 0 && targetStepIndex < lines.size()) {
            int start = Math.max(0, targetStepIndex - 2);
            int end = Math.min(lines.size(), targetStepIndex + 3);
            return String.join("\n", lines.subList(start, end));
        }
        return extractTruncatedTranscript(lines, 100);
    }

    private String extractTruncatedTranscript(List<String> lines, int maxLines) {
        if (lines.size() <= maxLines) {
            return String.join("\n", lines);
        }
        int half = maxLines / 2;
        List<String> combined = new ArrayList<>(lines.subList(0, half));
        combined.add("... [ intermediate lines omitted for brevity ] ...");
        combined.addAll(lines.subList(lines.size() - half, lines.size()));
        return String.join("\n", combined);
    }

    private int parseNumber(String input, int defaultVal) {
        if (input == null) return defaultVal;
        String digits = input.replaceAll("\\D+", "");
        if (digits.isEmpty()) return defaultVal;
        try {
            return Integer.parseInt(digits);
        } catch (NumberFormatException e) {
            return defaultVal;
        }
    }
}
