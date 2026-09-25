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

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.PathVariable;
import io.micronaut.http.annotation.QueryValue;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Controller("/api/brain")
public class BrainController {

    private final ConversationDatabaseService dbService;

    public BrainController(ConversationDatabaseService dbService) {
        this.dbService = dbService;
    }

    private Path getBrainPath(String flavor) {
        if (flavor == null || flavor.isEmpty()) flavor = "antigravity-cli";
        return Paths.get(System.getProperty("user.home"), ".gemini", flavor, "brain");
    }

    @ExecuteOn(TaskExecutors.IO)
    @Get("/flavors")
    public List<String> listFlavors() {
        Path geminiPath = Paths.get(System.getProperty("user.home"), ".gemini");
        try (Stream<Path> paths = Files.list(geminiPath)) {
            return paths
                .filter(Files::isDirectory)
                .map(p -> p.getFileName().toString())
                // Restricting: only "antigravity", "antigravity-cli", "antigravity-ide" or "jetski"
                // that actually contain a "brain" folder
                .filter(name -> {
                    boolean matches =
                        name.equals("antigravity") ||
                        name.equals("antigravity-cli") ||
                        name.equals("antigravity-ide") ||
                        name.equals("jetski");
                    if (!matches) return false;
                    Path brainPath = Paths.get(
                        System.getProperty("user.home"),
                        ".gemini",
                        name,
                        "brain"
                    );
                    return Files.exists(brainPath);
                })
                .collect(Collectors.toList());
        } catch (IOException e) {
            e.printStackTrace();
            return List.of();
        }
    }

    @ExecuteOn(TaskExecutors.IO)
    @Get("/conversations")
    public List<ConversationSummary> listConversations(@QueryValue Optional<String> flavor) {
        String currentFlavor = flavor.orElse("antigravity-cli");
        Path brainPath = getBrainPath(currentFlavor);
        Optional<Path> dbPathOpt = dbService.getDatabasePath(currentFlavor);

        if (dbPathOpt.isPresent()) {
            List<ConversationSummary> dbList = dbService.listConversationsFromDb(dbPathOpt.get());
            if (!dbList.isEmpty()) {
                List<ConversationSummary> verified = new ArrayList<>();
                Set<String> seenIds = new HashSet<>();

                for (ConversationSummary c : dbList) {
                    Path convDir = brainPath.resolve(c.id());
                    if (Files.exists(convDir)) {
                        seenIds.add(c.id());
                        String updatedAt = c.updatedAt();
                        if (updatedAt == null || updatedAt.equals("0")) {
                            Path transcriptPath = resolveTranscriptPath(convDir);
                            if (transcriptPath != null) {
                                try {
                                    updatedAt =
                                        String.valueOf(
                                            Files.getLastModifiedTime(transcriptPath).toMillis()
                                        );
                                } catch (IOException ignored) {}
                            }
                        }
                        verified.add(
                            new ConversationSummary(
                                c.id(),
                                c.summary(),
                                c.preview(),
                                c.stepCount(),
                                updatedAt,
                                c.status(),
                                c.workspaceUri(),
                                c.parentConversationId(),
                                c.nestingDepth(),
                                c.agentName(),
                                c.isSubagent(),
                                c.projectId(),
                                c.projectName()
                            )
                        );
                    }
                }

                // Merge unindexed sessions found directly in the filesystem
                if (Files.exists(brainPath)) {
                    try (Stream<Path> paths = Files.list(brainPath)) {
                        paths
                            .filter(Files::isDirectory)
                            .forEach(p -> {
                                String id = p.getFileName().toString();
                                if (!seenIds.contains(id)) {
                                    Path transcriptPath = resolveTranscriptPath(p);
                                    if (transcriptPath != null) {
                                        try {
                                            if (Files.size(transcriptPath) > 0) {
                                                long modified = Files
                                                    .getLastModifiedTime(transcriptPath)
                                                    .toMillis();
                                                String fallbackSummary =
                                                    extractSummaryFromTranscript(p);
                                                verified.add(
                                                    new ConversationSummary(
                                                        id,
                                                        fallbackSummary,
                                                        "",
                                                        0,
                                                        String.valueOf(modified),
                                                        "",
                                                        "",
                                                        "",
                                                        0,
                                                        "",
                                                        false,
                                                        "",
                                                        ""
                                                    )
                                                );
                                            }
                                        } catch (IOException ignored) {}
                                    }
                                }
                            });
                    } catch (IOException ignored) {}
                }

                verified.sort((a, b) ->
                    Long.compare(
                        Long.parseLong(
                            b.updatedAt() != null && !b.updatedAt().isBlank() ? b.updatedAt() : "0"
                        ),
                        Long.parseLong(
                            a.updatedAt() != null && !a.updatedAt().isBlank() ? a.updatedAt() : "0"
                        )
                    )
                );

                return verified;
            }
        }

        return listConversationsFromFilesystem(brainPath);
    }

    private List<ConversationSummary> listConversationsFromFilesystem(Path brainPath) {
        if (!Files.exists(brainPath)) return List.of();

        try (Stream<Path> paths = Files.list(brainPath)) {
            return paths
                .filter(p -> {
                    if (!Files.isDirectory(p)) return false;
                    Path transcriptPath = resolveTranscriptPath(p);
                    if (transcriptPath == null) return false;
                    try {
                        return Files.size(transcriptPath) > 0;
                    } catch (IOException e) {
                        return false;
                    }
                })
                .map(p -> {
                    String id = p.getFileName().toString();
                    String summary = extractSummaryFromTranscript(p);
                    long modified = 0L;
                    try {
                        Path transcriptPath = resolveTranscriptPath(p);
                        if (transcriptPath != null) {
                            modified = Files.getLastModifiedTime(transcriptPath).toMillis();
                        }
                    } catch (IOException ignored) {}

                    return new ConversationSummary(
                        id,
                        summary,
                        "",
                        0,
                        String.valueOf(modified),
                        "",
                        "",
                        "",
                        0,
                        "",
                        false,
                        "",
                        ""
                    );
                })
                .sorted((a, b) ->
                    Long.compare(Long.parseLong(b.updatedAt()), Long.parseLong(a.updatedAt()))
                )
                .collect(Collectors.toList());
        } catch (IOException e) {
            e.printStackTrace();
            return List.of();
        }
    }

    private Path resolveTranscriptPath(Path convDir) {
        Path full = convDir.resolve(".system_generated/logs/transcript_full.jsonl");
        if (Files.exists(full)) return full;
        Path regular = convDir.resolve(".system_generated/logs/transcript.jsonl");
        if (Files.exists(regular)) return regular;
        Path overview = convDir.resolve(".system_generated/logs/overview.txt");
        if (Files.exists(overview)) return overview;
        return null;
    }

    private String extractSummaryFromTranscript(Path p) {
        String id = p.getFileName().toString();
        String summary = "Conversation " + (id.length() > 8 ? id.substring(0, 8) : id);
        Path shortTitlePath = p.resolve(".system_generated/logs/short_title.txt");
        if (Files.exists(shortTitlePath)) {
            try {
                return Files.readString(shortTitlePath).trim();
            } catch (IOException ignored) {}
        }

        Path transcriptPath = resolveTranscriptPath(p);
        if (transcriptPath != null) {
            try (BufferedReader reader = Files.newBufferedReader(transcriptPath)) {
                ObjectMapper mapper = new ObjectMapper();
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.contains("\"USER_INPUT\"")) {
                        Map<String, Object> map = mapper.readValue(line, Map.class);
                        if ("USER_INPUT".equals(map.get("type"))) {
                            String content = (String) map.getOrDefault("content", "");
                            content = content.replaceAll("(?s)<USER_REQUEST>\\s*", "");
                            int endIdx = content.indexOf("</USER_REQUEST>");
                            if (endIdx != -1) {
                                content = content.substring(0, endIdx);
                            }
                            content = content.trim();
                            if (content.length() > 80) {
                                content = content.substring(0, 80) + "...";
                            }
                            if (!content.isEmpty()) {
                                summary = content;
                            }
                            break;
                        }
                    }
                }
            } catch (Exception ignored) {}
        }
        return summary;
    }

    @ExecuteOn(TaskExecutors.IO)
    @Get(value = "/conversations/{id}/transcript", produces = "application/json")
    public String getTranscript(@PathVariable String id, @QueryValue Optional<String> flavor)
        throws IOException {
        Path brainPath = getBrainPath(flavor.orElse("antigravity-cli"));
        Path transcriptPath = resolveTranscriptPath(brainPath.resolve(id));
        if (transcriptPath == null) {
            return "[]";
        }

        // Read JSONL and convert to a JSON array of objects
        try (Stream<String> lines = Files.lines(transcriptPath)) {
            String jsonArray = lines
                .map(String::trim)
                .filter(line -> !line.isEmpty())
                .collect(Collectors.joining(",", "[", "]"));
            return jsonArray;
        }
    }

    @ExecuteOn(TaskExecutors.IO)
    @Get(value = "/file", produces = "text/plain")
    public HttpResponse<String> getFileContent(@QueryValue String path) {
        try {
            Path filePath = Paths.get(path).normalize();
            Path geminiDir = Paths.get(System.getProperty("user.home"), ".gemini").normalize();
            if (!filePath.startsWith(geminiDir)) {
                return HttpResponse.unauthorized();
            }
            if (Files.exists(filePath) && !Files.isDirectory(filePath)) {
                return HttpResponse.ok(Files.readString(filePath));
            } else {
                return HttpResponse.notFound("File not found or is a directory.");
            }
        } catch (IOException e) {
            return HttpResponse.serverError("Error reading file: " + e.getMessage());
        }
    }

    @ExecuteOn(TaskExecutors.IO)
    @Get(value = "/conversations/{id}/artifacts", produces = "application/json")
    public List<Map<String, Object>> getArtifacts(
        @PathVariable String id,
        @QueryValue Optional<String> flavor
    ) {
        Path brainPath = getBrainPath(flavor.orElse("antigravity-cli")).resolve(id);
        if (!Files.exists(brainPath)) return List.of();

        List<Map<String, Object>> artifacts = new ArrayList<>();
        ObjectMapper mapper = new ObjectMapper();
        try (Stream<Path> files = Files.list(brainPath)) {
            files
                .filter(p -> Files.isRegularFile(p) && p.getFileName().toString().endsWith(".md"))
                .forEach(p -> {
                    String filename = p.getFileName().toString();
                    Map<String, Object> art = new HashMap<>();
                    art.put("filename", filename);
                    art.put("path", p.toAbsolutePath().toString());
                    try {
                        art.put("size", Files.size(p));
                        art.put("updatedAt", Files.getLastModifiedTime(p).toMillis());
                    } catch (IOException e) {
                        art.put("size", 0L);
                        art.put("updatedAt", 0L);
                    }

                    // Look for metadata file: <filename>.metadata.json or <filename_without_ext>.metadata.json
                    Path metaPath = brainPath.resolve(filename + ".metadata.json");
                    if (!Files.exists(metaPath)) {
                        String base = filename.substring(0, filename.lastIndexOf('.'));
                        metaPath = brainPath.resolve(base + ".metadata.json");
                    }
                    if (Files.exists(metaPath)) {
                        try {
                            Map<String, Object> meta = mapper.readValue(
                                Files.readString(metaPath),
                                Map.class
                            );
                            art.put("metadata", meta);
                        } catch (Exception e) {}
                    }
                    artifacts.add(art);
                });
        } catch (IOException e) {}

        artifacts.sort((a, b) -> Long.compare((Long) b.get("updatedAt"), (Long) a.get("updatedAt"))
        );
        return artifacts;
    }

    @ExecuteOn(TaskExecutors.IO)
    @Get(value = "/conversations/{id}/snapshots", produces = "application/json")
    public List<Map<String, String>> getSnapshots(
        @PathVariable String id,
        @QueryValue Optional<String> flavor
    ) {
        Path convPath = getBrainPath(flavor.orElse("antigravity-cli")).resolve(id);
        Path gitDir = convPath.resolve(".git");
        if (!Files.exists(gitDir)) return List.of();

        List<Map<String, String>> snapshots = new ArrayList<>();
        try {
            Process process = new ProcessBuilder(
                "git",
                "-C",
                convPath.toAbsolutePath().toString(),
                "log",
                "--pretty=format:%H|%an|%ad|%s",
                "--date=iso",
                "-n",
                "50"
            )
                .redirectErrorStream(true)
                .start();

            try (
                BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream())
                )
            ) {
                String line;
                while ((line = reader.readLine()) != null) {
                    String[] parts = line.split("\\|", 4);
                    if (parts.length == 4) {
                        Map<String, String> snap = new HashMap<>();
                        snap.put("hash", parts[0]);
                        snap.put("author", parts[1]);
                        snap.put("date", parts[2]);
                        snap.put("message", parts[3]);
                        snapshots.add(snap);
                    }
                }
            }
            process.waitFor();
        } catch (Exception e) {}
        return snapshots;
    }

    @ExecuteOn(TaskExecutors.IO)
    @Get(value = "/conversations/{id}/diff", produces = "text/plain")
    public HttpResponse<String> getDiff(
        @PathVariable String id,
        @QueryValue String commit,
        @QueryValue Optional<String> flavor
    ) {
        Path convPath = getBrainPath(flavor.orElse("antigravity-cli")).resolve(id);
        Path gitDir = convPath.resolve(".git");
        if (!Files.exists(gitDir)) {
            return HttpResponse.notFound("No git repository found for conversation");
        }

        try {
            Process process = new ProcessBuilder(
                "git",
                "-C",
                convPath.toAbsolutePath().toString(),
                "show",
                commit
            )
                .redirectErrorStream(true)
                .start();

            String diffOutput = new String(process.getInputStream().readAllBytes());
            process.waitFor();
            return HttpResponse.ok(diffOutput);
        } catch (Exception e) {
            return HttpResponse.serverError("Error generating diff: " + e.getMessage());
        }
    }

    @ExecuteOn(TaskExecutors.IO)
    @Get(value = "/conversations/{id}/messages", produces = "application/json")
    public List<Map<String, Object>> getMessages(
        @PathVariable String id,
        @QueryValue Optional<String> flavor
    ) {
        Path messagesDir = getBrainPath(flavor.orElse("antigravity-cli"))
            .resolve(id)
            .resolve(".system_generated/messages");
        if (!Files.exists(messagesDir)) return List.of();

        List<Map<String, Object>> messages = new ArrayList<>();
        ObjectMapper mapper = new ObjectMapper();
        try (Stream<Path> files = Files.list(messagesDir)) {
            files
                .filter(p -> {
                    String name = p.getFileName().toString();
                    return (
                        Files.isRegularFile(p) &&
                        name.endsWith(".json") &&
                        !name.equals("read.json") &&
                        !name.equals("cursor.json")
                    );
                })
                .forEach(p -> {
                    try {
                        Map<String, Object> msg = mapper.readValue(Files.readString(p), Map.class);
                        messages.add(msg);
                    } catch (Exception e) {}
                });
        } catch (IOException e) {}

        messages.sort((a, b) -> {
            String tsA = (String) a.getOrDefault("timestamp", "");
            String tsB = (String) b.getOrDefault("timestamp", "");
            return tsB.compareTo(tsA);
        });
        return messages;
    }
}
