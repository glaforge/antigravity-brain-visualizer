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
import dev.langchain4j.model.TokenCountEstimator;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.request.ResponseFormat;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.google.genai.GoogleGenAiChatModel;
import dev.langchain4j.model.google.genai.GoogleGenAiTokenCountEstimator;
import io.micronaut.context.annotation.Property;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

@MicronautTest
@Property(name = "gemini.model", value = "gemini-3.8-flash")
@Property(name = "gemini.debug", value = "true")
class Gemini38FlashAnalysisTest {

    @Inject
    AnalyzerService analyzerService;

    @Inject
    AnalysisController analysisController;

    @Test
    @EnabledIfEnvironmentVariable(named = "GEMINI_API_KEY", matches = ".+")
    void testTokenEstimatorWithGemini38Flash() {
        String apiKey = System.getenv("GEMINI_API_KEY");
        TokenCountEstimator estimator = GoogleGenAiTokenCountEstimator
            .builder()
            .apiKey(apiKey)
            .modelName("gemini-3.8-flash")
            .build();

        int tokens = estimator.estimateTokenCountInText(
            "This is a test prompt for token estimation."
        );
        System.out.println("Estimated tokens with gemini-3.8-flash: " + tokens);
        Assertions.assertTrue(tokens > 0);
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "GEMINI_API_KEY", matches = ".+")
    void testDirectGoogleGenAiChatModelWithGemini38Flash() {
        String apiKey = System.getenv("GEMINI_API_KEY");
        ChatModel model = GoogleGenAiChatModel
            .builder()
            .apiKey(apiKey)
            .modelName("gemini-3.8-flash")
            .temperature(0.0)
            .maxRetries(1)
            .timeout(Duration.ofMinutes(1))
            .responseFormat(ResponseFormat.JSON)
            .build();

        ChatResponse response = model.chat(
            ChatRequest
                .builder()
                .messages(
                    dev.langchain4j.data.message.SystemMessage.from(
                        "You are a helpful assistant. Output JSON with a 'message' field."
                    ),
                    dev.langchain4j.data.message.UserMessage.from(
                        "Respond with a test message in JSON format."
                    )
                )
                .build()
        );

        Assertions.assertNotNull(response);
        Assertions.assertNotNull(response.aiMessage());
        String text = response.aiMessage().text();
        System.out.println("Direct JSON response from gemini-3.8-flash: " + text);
        Assertions.assertTrue(text.contains("message"));
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "GEMINI_API_KEY", matches = ".+")
    void testAnalyzerServiceWithGemini38Flash() {
        String sampleTranscript = """
            USER REQUEST: The start game button doesn't do anything. Investigate and fix.
            AGENT ACTION: [find_by_name] Listing files in workspace -> /Users/glaforge/Projects/robotgame
            AGENT ACTION: [view_file] Viewing index.html -> /Users/glaforge/Projects/robotgame/index.html
            AGENT ACTION: [replace_file_content] Fixing event listener -> /Users/glaforge/Projects/robotgame/src/game.js
            AGENT ACTION: [run_command] Running test suite -> npm test
            SYSTEM EVENT/ERROR: 0 errors. All tests passing.
            """;

        AnalysisResponse analysis = analyzerService.analyze(sampleTranscript);

        Assertions.assertNotNull(analysis);
        System.out.println("Title: " + analysis.shortTitle());
        System.out.println("Summary: " + analysis.summary());
        System.out.println("Flow items: " + (analysis.flow() != null ? analysis.flow().size() : 0));
        System.out.println(
            "Actions: " + (analysis.agentActions() != null ? analysis.agentActions().size() : 0)
        );
        System.out.println("Issues: " + (analysis.issues() != null ? analysis.issues().size() : 0));
        System.out.println(
            "Recommendations: " +
            (analysis.recommendations() != null ? analysis.recommendations().size() : 0)
        );

        Assertions.assertNotNull(analysis.shortTitle());
        Assertions.assertFalse(analysis.shortTitle().isBlank());
        Assertions.assertNotNull(analysis.flow(), "flow should not be null");
        Assertions.assertFalse(analysis.flow().isEmpty(), "flow should not be empty");
        Assertions.assertNotNull(analysis.agentActions(), "agentActions should not be null");
        Assertions.assertFalse(
            analysis.agentActions().isEmpty(),
            "agentActions should not be empty"
        );
        Assertions.assertNotNull(analysis.issues(), "issues should not be null");
        Assertions.assertNotNull(analysis.recommendations(), "recommendations should not be null");
        Assertions.assertNotNull(analysis.summary());
        Assertions.assertFalse(analysis.summary().isBlank(), "summary should not be blank");
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "GEMINI_API_KEY", matches = ".+")
    void testRefineAnalysisWithGemini38Flash() {
        String initialTranscript = """
            USER REQUEST: Start game is failing with error.
            AGENT ACTION: [view_file] Inspect index.html
            """;
        AnalysisResponse initial = analyzerService.analyze(initialTranscript);
        Assertions.assertNotNull(initial);

        ObjectMapper mapper = new ObjectMapper();
        String nextTranscript = """
            AGENT ACTION: [replace_file_content] Fixed button ID in index.html
            AGENT ACTION: [run_command] Running test -> npm test
            SYSTEM EVENT/ERROR: Tests passed successfully!
            """;

        AnalysisResponse refined = null;
        try {
            refined =
                analyzerService.refineAnalysis(mapper.writeValueAsString(initial), nextTranscript);
        } catch (Exception e) {
            Assertions.fail("JSON serialization failed: " + e.getMessage());
        }

        Assertions.assertNotNull(refined);
        Assertions.assertNotNull(refined.shortTitle());
        Assertions.assertNotNull(refined.flow());
        Assertions.assertNotNull(refined.agentActions());
        Assertions.assertNotNull(refined.summary());
        System.out.println("Refined Title: " + refined.shortTitle());
        System.out.println("Refined Summary: " + refined.summary());
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "GEMINI_API_KEY", matches = ".+")
    void testConsolidateAnalysisWithGemini38Flash() {
        AnalysisResponse chunk1 = new AnalysisResponse(
            "Phase 1: Investigation",
            List.of("Examined file structure", "Identified missing dependency"),
            List.of(new AgentAction("view_file", "Checked package.json")),
            List.of(new Issue("Missing dep", "Identified in package.json")),
            List.of("Add dependency check script"),
            "Phase 1 focused on diagnosing the missing dependency."
        );

        AnalysisResponse chunk2 = new AnalysisResponse(
            "Phase 2: Resolution",
            List.of("Installed dependency", "Verified build"),
            List.of(new AgentAction("run_command", "Ran npm install")),
            List.of(),
            List.of(),
            "Phase 2 completed the installation and verified the build."
        );

        ObjectMapper mapper = new ObjectMapper();
        AnalysisResponse consolidated = null;
        try {
            String combinedJson = mapper.writeValueAsString(List.of(chunk1, chunk2));
            consolidated = analyzerService.consolidateAnalysis(combinedJson);
        } catch (Exception e) {
            Assertions.fail("Consolidation call failed: " + e.getMessage());
        }

        Assertions.assertNotNull(consolidated);
        Assertions.assertNotNull(consolidated.shortTitle());
        Assertions.assertNotNull(consolidated.flow());
        Assertions.assertNotNull(consolidated.agentActions());
        Assertions.assertNotNull(consolidated.summary());
        System.out.println("Consolidated Title: " + consolidated.shortTitle());
        System.out.println("Consolidated Summary: " + consolidated.summary());
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "GEMINI_API_KEY", matches = ".+")
    void testRealSessionAnalysisWithAnalysisController() throws Exception {
        String testConversationId = "b5ee20b7-4a16-46ce-8774-a910dc37c323";
        Path brainPath = Paths.get(
            System.getProperty("user.home"),
            ".gemini",
            "antigravity",
            "brain",
            testConversationId,
            ".system_generated",
            "logs",
            "transcript.jsonl"
        );

        if (!Files.exists(brainPath)) {
            System.out.println("Session transcript not found at " + brainPath + ", skipping test.");
            return;
        }

        String resultJson = analysisController.summarizeConversation(
            testConversationId,
            Optional.of(true),
            Optional.of("antigravity")
        );

        Assertions.assertNotNull(resultJson);
        Assertions.assertFalse(resultJson.isBlank());
        System.out.println("Real session analysis result length: " + resultJson.length());
        Assertions.assertTrue(resultJson.contains("shortTitle"), "Should contain shortTitle");
        Assertions.assertTrue(resultJson.contains("summary"), "Should contain summary");
    }
}
