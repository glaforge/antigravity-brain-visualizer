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
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Controller("/api/brain")
public class BrainController {

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
                    boolean matches = name.equals("antigravity") || 
                                      name.equals("antigravity-cli") || 
                                      name.equals("antigravity-ide") || 
                                      name.equals("jetski");
                    if (!matches) return false;
                    Path brainPath = Paths.get(System.getProperty("user.home"), ".gemini", name, "brain");
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
    public List<Map<String, String>> listConversations(@QueryValue Optional<String> flavor) {
        Path brainPath = getBrainPath(flavor.orElse("antigravity-cli"));
        if (!Files.exists(brainPath)) return List.of();

        try (Stream<Path> paths = Files.list(brainPath)) {
            return paths
                .filter(p -> {
                    if (!Files.isDirectory(p)) return false;
                    Path transcriptPath = p.resolve(".system_generated/logs/transcript.jsonl");
                    if (!Files.exists(transcriptPath)) return false;
                    try {
                        return Files.size(transcriptPath) > 0;
                    } catch (IOException e) {
                        return false;
                    }
                })
                .map(p -> {
                    String id = p.getFileName().toString();
                    Map<String, String> info = new HashMap<>();
                    info.put("id", id);

                    String summary = "Conversation " + id.substring(0, 8);
                    Path shortTitlePath = p.resolve(".system_generated/logs/short_title.txt");
                    if (Files.exists(shortTitlePath)) {
                        try {
                            summary = Files.readString(shortTitlePath).trim();
                        } catch (IOException e) {}
                    } else {
                        Path transcriptPath = p.resolve(".system_generated/logs/transcript.jsonl");
                        if (Files.exists(transcriptPath)) {
                            try (BufferedReader reader = Files.newBufferedReader(transcriptPath)) {
                                ObjectMapper mapper = new ObjectMapper();
                                String line;
                                while ((line = reader.readLine()) != null) {
                                    if (line.contains("\"USER_INPUT\"")) {
                                        Map<String, Object> map = mapper.readValue(line, Map.class);
                                        if ("USER_INPUT".equals(map.get("type"))) {
                                            String content = (String) map.getOrDefault(
                                                "content",
                                                ""
                                            );
                                            content =
                                                content.replaceAll("(?s)<USER_REQUEST>\\s*", "");
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
                            } catch (Exception e) {}
                        }
                    }

                    info.put("summary", summary);
                    try {
                        Path transcriptPath = p.resolve(".system_generated/logs/transcript.jsonl");
                        long modified = Files.getLastModifiedTime(transcriptPath).toMillis();
                        info.put("updatedAt", String.valueOf(modified));
                    } catch (IOException e) {
                        info.put("updatedAt", "0");
                    }
                    return info;
                })
                .sorted((a, b) ->
                    Long.compare(
                        Long.parseLong(b.get("updatedAt")),
                        Long.parseLong(a.get("updatedAt"))
                    )
                )
                .collect(Collectors.toList());
        } catch (IOException e) {
            e.printStackTrace();
            return List.of();
        }
    }

    @ExecuteOn(TaskExecutors.IO)
    @Get(value = "/conversations/{id}/transcript", produces = "application/json")
    public String getTranscript(@PathVariable String id, @QueryValue Optional<String> flavor)
        throws IOException {
        Path brainPath = getBrainPath(flavor.orElse("antigravity-cli"));
        Path transcriptPath = brainPath
            .resolve(id)
            .resolve(".system_generated/logs/transcript_full.jsonl");
        if (!Files.exists(transcriptPath)) {
            transcriptPath =
                brainPath.resolve(id).resolve(".system_generated/logs/transcript.jsonl");
        }
        if (!Files.exists(transcriptPath)) {
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
}
