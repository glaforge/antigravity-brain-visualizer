package io.github.glaforge.agybrainviz;

import dev.langchain4j.model.output.structured.Description;

public record AgentAction(
    @Description("Name of action") String action,
    @Description("Detailed breakdown of the action") String description
) {}
