package io.github.glaforge.agybrainviz;

import java.util.List;
import dev.langchain4j.model.output.structured.Description;

public record AnalysisResponse(
    @Description("A very short title (max 50 chars) summarizing the session")
    String shortTitle,
    
    @Description("List of simple string descriptions representing the flow of the conversation and goals")
    List<String> flow,
    
    @Description("List of agent actions taken during the session")
    List<AgentAction> agentActions,
    
    @Description("List of issues or errors encountered and how they were circumvented")
    List<Issue> issues,
    
    @Description("List of potential improvements (e.g., missing CLI tools, skills to create, or advice for AGENTS.md) that could help future sessions go faster or circumvent errors")
    List<String> recommendations,
    
    @Description("A short paragraph explaining the overall outcome")
    String summary
) {}
