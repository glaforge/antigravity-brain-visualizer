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

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.List;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ConversationDatabaseServiceTest {

    @Test
    void testListConversationsFromDb(@TempDir Path tempDir) throws Exception {
        Path dbPath = tempDir.resolve("conversation_summaries.db");

        try (
            Connection conn = DriverManager.getConnection("jdbc:sqlite:" + dbPath.toAbsolutePath());
            Statement stmt = conn.createStatement()
        ) {
            stmt.execute("""
                CREATE TABLE conversation_summaries (
                    conversation_id text PRIMARY KEY,
                    title text NOT NULL DEFAULT '',
                    preview text NOT NULL DEFAULT '',
                    step_count integer NOT NULL DEFAULT 0,
                    last_modified_time datetime NOT NULL,
                    last_user_input_time datetime NOT NULL,
                    workspace_uris text NOT NULL DEFAULT '',
                    status text NOT NULL DEFAULT '',
                    parent_conversation_id text NOT NULL DEFAULT '',
                    nesting_depth integer NOT NULL DEFAULT 0,
                    agent_name text NOT NULL DEFAULT '',
                    project_id text NOT NULL DEFAULT ''
                );
            """);

            stmt.execute("""
                INSERT INTO conversation_summaries VALUES (
                    'conv-parent-1',
                    'Parent Task Title',
                    'Preview of parent task',
                    42,
                    '2026-09-24 15:30:00+00:00',
                    '2026-09-24 15:20:00+00:00',
                    '["file:///Users/test/Projects/my-app"]',
                    'CASCADE_RUN_STATUS_IDLE',
                    '',
                    0,
                    '',
                    'proj-123'
                );
            """);

            stmt.execute("""
                INSERT INTO conversation_summaries VALUES (
                    'conv-child-2',
                    '',
                    'Doing research on frontend components',
                    15,
                    '2026-09-24 15:35:00+00:00',
                    '2026-09-24 15:31:00+00:00',
                    '["file:///Users/test/Projects/my-app"]',
                    'CASCADE_RUN_STATUS_RUNNING',
                    'conv-parent-1',
                    1,
                    'research',
                    'proj-123'
                );
            """);
        }

        ConversationDatabaseService service = new ConversationDatabaseService();
        List<ConversationSummary> summaries = service.listConversationsFromDb(dbPath);

        Assertions.assertNotNull(summaries);
        Assertions.assertEquals(2, summaries.size());

        ConversationSummary child = summaries
            .stream()
            .filter(c -> c.id().equals("conv-child-2"))
            .findFirst()
            .orElseThrow();

        Assertions.assertTrue(child.isSubagent());
        Assertions.assertEquals("conv-parent-1", child.parentConversationId());
        Assertions.assertEquals(1, child.nestingDepth());
        Assertions.assertEquals("research", child.agentName());
        Assertions.assertEquals("CASCADE_RUN_STATUS_RUNNING", child.status());
        Assertions.assertEquals(15, child.stepCount());
        Assertions.assertTrue(child.summary().contains("research"));
        Assertions.assertEquals("proj-123", child.projectId());

        ConversationSummary parent = summaries
            .stream()
            .filter(c -> c.id().equals("conv-parent-1"))
            .findFirst()
            .orElseThrow();

        Assertions.assertFalse(parent.isSubagent());
        Assertions.assertEquals("Parent Task Title", parent.summary());
        Assertions.assertEquals(42, parent.stepCount());
        Assertions.assertTrue(parent.workspaceUri().contains("my-app"));
        Assertions.assertEquals("proj-123", parent.projectId());
    }
}
