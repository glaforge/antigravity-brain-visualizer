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

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.inject.Singleton;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.temporal.ChronoField;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.sqlite.SQLiteConfig;

@Singleton
public class ConversationDatabaseService {

    public record ProjectMetadata(
        Map<String, String> namesById,
        Map<String, String> namesByFolder
    ) {}

    private static final Logger LOG = LoggerFactory.getLogger(ConversationDatabaseService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final DateTimeFormatter DB_TIMESTAMP_FORMATTER = new DateTimeFormatterBuilder()
        .appendPattern("yyyy-MM-dd")
        .optionalStart()
        .appendLiteral('T')
        .optionalEnd()
        .optionalStart()
        .appendLiteral(' ')
        .optionalEnd()
        .appendPattern("HH:mm:ss")
        .optionalStart()
        .appendFraction(ChronoField.NANO_OF_SECOND, 0, 9, true)
        .optionalEnd()
        .appendOffset("+HH:MM", "Z")
        .toFormatter();

    public Optional<Path> getDatabasePath(String flavor) {
        if (flavor == null || flavor.isBlank()) {
            flavor = "antigravity-cli";
        }
        Path dbPath = Paths.get(
            System.getProperty("user.home"),
            ".gemini",
            flavor,
            "conversation_summaries.db"
        );
        return Files.exists(dbPath) ? Optional.of(dbPath) : Optional.empty();
    }

    public List<ConversationSummary> listConversationsFromDb(Path dbPath) {
        ProjectMetadata projects = loadConfiguredProjects();
        List<ConversationSummary> results = new ArrayList<>();
        String url = "jdbc:sqlite:" + dbPath.toAbsolutePath();
        SQLiteConfig config = new SQLiteConfig();
        config.setReadOnly(true);

        String query = """
            SELECT conversation_id, title, preview, step_count, last_modified_time,
                   last_user_input_time, status, workspace_uris, parent_conversation_id,
                   nesting_depth, agent_name, project_id
            FROM conversation_summaries
            ORDER BY last_modified_time DESC
        """;

        try (
            Connection conn = DriverManager.getConnection(url, config.toProperties());
            PreparedStatement stmt = conn.prepareStatement(query);
            ResultSet rs = stmt.executeQuery()
        ) {
            while (rs.next()) {
                String id = rs.getString("conversation_id");
                if (id == null || id.isBlank()) {
                    continue;
                }

                String rawTitle = rs.getString("title");
                String rawPreview = rs.getString("preview");
                int stepCount = rs.getInt("step_count");
                String lastModified = rs.getString("last_modified_time");
                String lastUserInput = rs.getString("last_user_input_time");
                String status = rs.getString("status");
                String rawWorkspaceUris = rs.getString("workspace_uris");
                String parentId = rs.getString("parent_conversation_id");
                int nestingDepth = rs.getInt("nesting_depth");
                String agentName = rs.getString("agent_name");
                String projectId = rs.getString("project_id");
                if (projectId == null) projectId = "";

                boolean isSubagent = parentId != null && !parentId.isBlank();
                long updatedAt = parseTimestamp(lastModified);
                if (updatedAt <= 0) {
                    updatedAt = parseTimestamp(lastUserInput);
                }

                String workspaceUri = parseWorkspaceUri(rawWorkspaceUris);
                String summary = resolveTitle(id, rawTitle, rawPreview, agentName, isSubagent);

                String projectName = "";
                if (!projectId.isBlank() && projects.namesById().containsKey(projectId)) {
                    projectName = projects.namesById().get(projectId);
                } else if (
                    !workspaceUri.isBlank() && projects.namesByFolder().containsKey(workspaceUri)
                ) {
                    projectName = projects.namesByFolder().get(workspaceUri);
                } else if (!workspaceUri.isBlank()) {
                    Path p = Paths.get(workspaceUri);
                    Path fileName = p.getFileName();
                    projectName = fileName != null ? fileName.toString() : workspaceUri;
                }

                results.add(
                    new ConversationSummary(
                        id,
                        summary,
                        rawPreview != null ? rawPreview.trim() : "",
                        stepCount,
                        String.valueOf(updatedAt),
                        status != null ? status : "",
                        workspaceUri,
                        parentId != null ? parentId.trim() : "",
                        nestingDepth,
                        agentName != null ? agentName.trim() : "",
                        isSubagent,
                        projectId,
                        projectName
                    )
                );
            }
        } catch (SQLException e) {
            LOG.warn("Failed to query SQLite database at {}: {}", dbPath, e.getMessage());
        }

        return results;
    }

    public ProjectMetadata loadConfiguredProjects() {
        Map<String, String> namesById = new HashMap<>();
        Map<String, String> namesByFolder = new HashMap<>();
        Path projectsDir = Paths.get(
            System.getProperty("user.home"),
            ".gemini",
            "config",
            "projects"
        );
        if (Files.exists(projectsDir)) {
            try (Stream<Path> stream = Files.list(projectsDir)) {
                stream
                    .filter(p -> p.toString().endsWith(".json"))
                    .forEach(p -> {
                        try {
                            Map<String, Object> map = MAPPER.readValue(p.toFile(), Map.class);
                            String id = (String) map.get("id");
                            String name = (String) map.get("name");
                            if (id != null && name != null && !name.isBlank()) {
                                namesById.put(id, name.trim());
                            }
                            Object pr = map.get("projectResources");
                            if (pr instanceof Map<?, ?> prMap) {
                                Object res = prMap.get("resources");
                                if (res instanceof List<?> resList) {
                                    for (Object r : resList) {
                                        if (r instanceof Map<?, ?> rMap) {
                                            String folderUri = (String) rMap.get("folderUri");
                                            if (
                                                folderUri == null &&
                                                rMap.get("gitFolder") instanceof Map<?, ?> gfMap
                                            ) {
                                                folderUri = (String) gfMap.get("folderUri");
                                            }
                                            if (folderUri != null && name != null) {
                                                String normalized = folderUri.replace(
                                                    "file://",
                                                    ""
                                                );
                                                namesByFolder.put(normalized, name.trim());
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (Exception ignored) {}
                    });
            } catch (Exception ignored) {}
        }
        return new ProjectMetadata(namesById, namesByFolder);
    }

    private long parseTimestamp(String timestampStr) {
        if (timestampStr == null || timestampStr.isBlank()) {
            return 0L;
        }
        try {
            // First try standard ISO-8601
            return Instant.parse(timestampStr.replace(' ', 'T')).toEpochMilli();
        } catch (Exception e1) {
            try {
                OffsetDateTime odt = OffsetDateTime.parse(timestampStr, DB_TIMESTAMP_FORMATTER);
                if (odt.getYear() <= 1970) {
                    return 0L;
                }
                return odt.toInstant().toEpochMilli();
            } catch (Exception e2) {
                return 0L;
            }
        }
    }

    private String parseWorkspaceUri(String rawJson) {
        if (rawJson == null || rawJson.isBlank() || rawJson.equals("[]")) {
            return "";
        }
        try {
            List<String> list = MAPPER.readValue(rawJson, new TypeReference<List<String>>() {});
            if (!list.isEmpty()) {
                String uriStr = list.get(0);
                if (uriStr.startsWith("file://")) {
                    try {
                        return Paths.get(URI.create(uriStr)).toString();
                    } catch (Exception e) {
                        return URLDecoder.decode(
                            uriStr.substring("file://".length()),
                            StandardCharsets.UTF_8
                        );
                    }
                }
                return uriStr;
            }
        } catch (Exception ignored) {
            // If rawJson was plain string path
            if (rawJson.startsWith("file://")) {
                return rawJson.substring("file://".length());
            }
            return rawJson;
        }
        return "";
    }

    private String resolveTitle(
        String id,
        String rawTitle,
        String rawPreview,
        String agentName,
        boolean isSubagent
    ) {
        if (rawTitle != null && !rawTitle.isBlank()) {
            return rawTitle.trim();
        }

        if (rawPreview != null && !rawPreview.isBlank()) {
            String cleaned = rawPreview
                .replaceAll("(?s)<[^>]+>", " ")
                .replaceAll("\\s+", " ")
                .trim();
            if (!cleaned.isEmpty()) {
                if (cleaned.length() > 80) {
                    cleaned = cleaned.substring(0, 80) + "...";
                }
                if (isSubagent && agentName != null && !agentName.isBlank()) {
                    return "[" + agentName + "] " + cleaned;
                }
                return cleaned;
            }
        }

        if (isSubagent && agentName != null && !agentName.isBlank()) {
            return "Subagent (" + agentName + ")";
        }

        return "Conversation " + (id.length() > 8 ? id.substring(0, 8) : id);
    }
}
