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

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class GenerativeUiWidgetBuilderTest {

    @Test
    void testNativeTokensAndNewStepTypes(@TempDir Path tempDir) throws Exception {
        Path logsDir = tempDir.resolve(".system_generated/logs");
        Files.createDirectories(logsDir);
        Path transcriptPath = logsDir.resolve("transcript.jsonl");

        String transcript = """
            {"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","created_at":"2026-11-26T10:00:00Z","content":"<USER_REQUEST>Update dependencies</USER_REQUEST>"}
            {"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-11-26T10:00:02Z","model":"gemini-4-hydrogen-high","input_tokens":10000,"cache_read_tokens":90000,"output_tokens":2000,"content":"Checking dependencies.","tool_calls":[{"name":"run_command","args":{"CommandLine":"./gradlew test"}}]}
            {"step_index":2,"source":"MODEL","type":"AGENCY_TOOL_CALL","status":"DONE","created_at":"2026-11-26T10:00:05Z","content":"Tool response"}
            {"step_index":3,"source":"SYSTEM","type":"CHECKPOINT","status":"DONE","created_at":"2026-11-26T10:00:06Z","input_tokens":1000,"cache_read_tokens":10000,"output_tokens":500,"content":"Compaction checkpoint"}
            """;
        Files.writeString(transcriptPath, transcript);

        GenerativeUiWidgetBuilder builder = new GenerativeUiWidgetBuilder();
        String html = builder.buildWidgetHtml(
            "12345678-abcd-ef00-1234-56789abcdef0",
            "Update Dependencies",
            "IDLE",
            "agy-brain",
            tempDir,
            transcriptPath
        );

        Assertions.assertTrue(html.contains("Token Distribution (Exact API Metrics)"));
        Assertions.assertTrue(html.contains("Uncached Input"));
        Assertions.assertTrue(html.contains("Cache Read"));
        Assertions.assertTrue(html.contains("gemini-4-hydrogen-high"));
        Assertions.assertTrue(html.contains("113.5k"));
        Assertions.assertTrue(html.contains("$0.043"));
    }

    @Test
    void testLegacyHeuristicFallback(@TempDir Path tempDir) throws Exception {
        Path logsDir = tempDir.resolve(".system_generated/logs");
        Files.createDirectories(logsDir);
        Path transcriptPath = logsDir.resolve("transcript.jsonl");

        String transcript = """
            {"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","created_at":"2026-06-01T10:00:00Z","content":"Hello world"}
            {"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-06-01T10:00:02Z","thinking":"Reasoning about response","content":"Here is the answer."}
            """;
        Files.writeString(transcriptPath, transcript);

        GenerativeUiWidgetBuilder builder = new GenerativeUiWidgetBuilder();
        String html = builder.buildWidgetHtml(
            "abcdef12-3456-7890-abcd-ef1234567890",
            "Legacy Session",
            "IDLE",
            "",
            tempDir,
            transcriptPath
        );

        Assertions.assertTrue(html.contains("Token Distribution (Heuristic ~4 chars/tok)"));
        Assertions.assertTrue(html.contains("gemini-4-hydrogen"));
        Assertions.assertTrue(html.contains("Thinking"));
    }
}
