package io.github.glaforge.agybrainviz;

import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.PathVariable;
import io.micronaut.http.annotation.QueryValue;
import jakarta.inject.Inject;
import java.util.Optional;
import java.util.Map;
import java.util.Iterator;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.ArrayNode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.ArrayList;
import java.util.concurrent.ConcurrentHashMap;
import dev.langchain4j.model.TokenCountEstimator;
import dev.langchain4j.model.google.genai.GoogleGenAiTokenCountEstimator;

@Controller("/api/analysis")
public class AnalysisController {

    private Path getBrainPath(String flavor) {
        if (flavor == null || flavor.isEmpty()) flavor = "antigravity-cli";
        return Paths.get(System.getProperty("user.home"), ".gemini", flavor, "brain");
    }
    
    private static final int MAX_TOKENS_PER_CHUNK = 100_000;
    private static final Map<String, Integer> progressMap = new ConcurrentHashMap<>();

    @Get(value = "/conversations/{id}/progress", produces = "application/json")
    public String getProgress(@PathVariable String id) {
        int progress = progressMap.getOrDefault(id, -1);
        if (progress == -2) {
            return "{\"phase\": \"Estimating Tokens & Chunking...\", \"progress\": 5}";
        } else if (progress >= 0) {
            return "{\"phase\": \"Analyzing chunks...\", \"progress\": " + progress + "}";
        }
        return "{\"phase\": \"\", \"progress\": -1}";
    }
    
    private final AnalyzerService analyzerService;

    @Inject
    public AnalysisController(dev.langchain4j.model.chat.ChatModel chatModel) {
        this.analyzerService = dev.langchain4j.service.AiServices.builder(AnalyzerService.class)
            .chatModel(chatModel)
            .build();
    }

    private void splitIntoSafeChunks(List<String> lines, TokenCountEstimator estimator, int maxTokens, List<List<String>> safeChunks) {
        if (lines.isEmpty()) return;
        String text = String.join("\n", lines);
        try {
            int tokens = estimator.estimateTokenCountInText(text);
            if (tokens <= maxTokens || lines.size() == 1) {
                safeChunks.add(lines);
            } else {
                int mid = lines.size() / 2;
                splitIntoSafeChunks(lines.subList(0, mid), estimator, maxTokens, safeChunks);
                splitIntoSafeChunks(lines.subList(mid, lines.size()), estimator, maxTokens, safeChunks);
            }
        } catch (Exception e) {
            int fallbackTokens = text.length() / 2;
            if (fallbackTokens <= maxTokens || lines.size() == 1) {
                safeChunks.add(lines);
            } else {
                int mid = lines.size() / 2;
                splitIntoSafeChunks(lines.subList(0, mid), estimator, maxTokens, safeChunks);
                splitIntoSafeChunks(lines.subList(mid, lines.size()), estimator, maxTokens, safeChunks);
            }
        }
    }

    @Get(value = "/conversations/{id}/summarize", produces = "application/json")
    public String summarizeConversation(@PathVariable String id, @QueryValue Optional<Boolean> force, @QueryValue Optional<String> flavor) throws IOException {
        String apiKey = System.getenv("GEMINI_API_KEY");
        if (apiKey == null || apiKey.isEmpty()) {
            return "{\"summary\": \"Error: GEMINI_API_KEY environment variable is not set. Cannot use LangChain4j analysis.\"}";
        }

        Path brainPath = getBrainPath(flavor.orElse("antigravity-cli"));
        Path transcriptPath = brainPath.resolve(id).resolve(".system_generated").resolve("logs").resolve("transcript.jsonl");
        if (!Files.exists(transcriptPath)) {
            return "{\"summary\": \"No transcript found.\"}";
        }
        
        boolean forceRecompute = force.orElse(false);
        Path summaryJsonPath = brainPath.resolve(id).resolve(".system_generated").resolve("logs").resolve("summary.json");
        Path shortTitlePath = brainPath.resolve(id).resolve(".system_generated").resolve("logs").resolve("short_title.txt");
        
        if (!forceRecompute && Files.exists(summaryJsonPath)) {
            String json = Files.readString(summaryJsonPath);
            return json;
        }

        ObjectMapper mapper = new ObjectMapper();
        AnalysisResponse responseObj = null;

        try {
            List<String> allLines = Files.readAllLines(transcriptPath);
            List<String> sanitizedLines = new ArrayList<>();
            for (String line : allLines) {
                if (line.trim().isEmpty()) continue;
                try {
                    JsonNode node = mapper.readTree(line);
                    String type = node.path("type").asText("");
                    if ("USER_INPUT".equals(type) || "USER_EXPLICIT".equals(node.path("source").asText(""))) {
                        String content = node.path("content").asText("");
                        sanitizedLines.add("USER REQUEST: " + content.substring(0, Math.min(2000, content.length())));
                    } else if ("PLANNER_RESPONSE".equals(type) || "MODEL".equals(node.path("source").asText(""))) {
                        JsonNode tools = node.path("tool_calls");
                        if (!tools.isMissingNode() && tools.isArray()) {
                            for (JsonNode tool : tools) {
                                String name = tool.path("name").asText("unknown");
                                String action = tool.path("arguments").path("toolAction").asText("");
                                String tgt = tool.path("arguments").path("TargetFile").asText("");
                                if (tgt.isEmpty()) tgt = tool.path("arguments").path("CommandLine").asText("");
                                sanitizedLines.add("AGENT ACTION: [" + name + "] " + action + " -> " + tgt);
                            }
                        }
                    } else if (node.has("error") || (node.has("content") && node.path("content").asText("").contains("Exception"))) {
                        String err = node.path("content").asText("");
                        sanitizedLines.add("SYSTEM EVENT/ERROR: " + err.substring(0, Math.min(500, err.length())));
                    }
                } catch (Exception e) {
                    // skip malformed
                }
            }
            
            TokenCountEstimator estimator = GoogleGenAiTokenCountEstimator.builder()
                .apiKey(apiKey)
                .modelName("gemini-3.5-flash")
                .build();
                
            progressMap.put(id, -2); // Phase 1: Estimating
            List<List<String>> safeChunks = new ArrayList<>();
            splitIntoSafeChunks(sanitizedLines, estimator, MAX_TOKENS_PER_CHUNK, safeChunks);
            
            int totalChunks = safeChunks.size();
            int currentChunk = 0;
            System.out.println("Total chunks to process: " + totalChunks);
            
            progressMap.put(id, 0); // start at 0%
            
            for (List<String> linesChunk : safeChunks) {
                String chunk = String.join("\n", linesChunk);
                int chunkTokens = estimator.estimateTokenCountInText(chunk);
                System.out.println("Processing chunk " + (currentChunk + 1) + " of " + totalChunks + ". Chunk Token count: " + chunkTokens);
                
                if (responseObj == null) {
                    responseObj = analyzerService.analyze(chunk);
                    String outJson = mapper.writeValueAsString(responseObj);
                    System.out.println("Output JSON token count: " + estimator.estimateTokenCountInText(outJson));
                } else {
                    String prevJson = mapper.writeValueAsString(responseObj);
                    int prevTokens = estimator.estimateTokenCountInText(prevJson);
                    System.out.println("Previous JSON token count: " + prevTokens);
                    System.out.println("Total combined token count estimate (chunk + prev): " + (chunkTokens + prevTokens));
                    responseObj = analyzerService.refineAnalysis(prevJson, chunk);
                    String outJson = mapper.writeValueAsString(responseObj);
                    System.out.println("Output JSON token count: " + estimator.estimateTokenCountInText(outJson));
                }
                
                currentChunk++;
                int pct = (int) Math.round((currentChunk * 100.0) / totalChunks);
                progressMap.put(id, pct);
            }
            
            if (responseObj == null) {
                return "{\"summary\": \"No transcript lines found.\"}";
            }
            
            String jsonResponse = mapper.writeValueAsString(responseObj);
            
            // Try to extract shortTitle for shortTitlePath caching
            try {
                String title = responseObj.shortTitle();
                if (title != null && !title.isEmpty()) {
                    Files.writeString(shortTitlePath, title.trim());
                }
            } catch (Exception e) {}
            
            try {
                Files.writeString(summaryJsonPath, jsonResponse);
                return jsonResponse;
            } catch (Exception e) {
                throw new Exception("Invalid JSON response");
            }
        } catch (Exception e) {
            System.err.println("Exception caught during analysis:");
            e.printStackTrace();
            try {
                return mapper.writeValueAsString(Map.of("summary", "Error generating summary: " + e.getMessage()));
            } catch (Exception ex) {
                return "{\"summary\": \"Error generating summary: Unknown error\"}";
            }
        } finally {
            progressMap.remove(id);
        }
    }

    private void truncateLongStrings(JsonNode node) {
        if (node.isObject()) {
            ObjectNode obj = (ObjectNode) node;
            Iterator<Map.Entry<String, JsonNode>> fields = obj.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                if (field.getValue().isTextual()) {
                    String text = field.getValue().asText();
                    if (text.length() > 1000) {
                        obj.put(field.getKey(), text.substring(0, 1000) + "... [TRUNCATED]");
                    }
                } else {
                    truncateLongStrings(field.getValue());
                }
            }
        } else if (node.isArray()) {
            ArrayNode array = (ArrayNode) node;
            if (array.size() > 20) {
                while (array.size() > 20) {
                    array.remove(array.size() - 1);
                }
                array.add(array.textNode("... [TRUNCATED ARRAY]"));
            }
            for (int i = 0; i < array.size(); i++) {
                JsonNode item = array.get(i);
                if (item.isTextual()) {
                    String text = item.asText();
                    if (text.length() > 500) {
                        array.set(i, array.textNode(text.substring(0, 500) + "... [TRUNCATED STRING]"));
                    }
                } else {
                    truncateLongStrings(item);
                }
            }
        }
    }
}
