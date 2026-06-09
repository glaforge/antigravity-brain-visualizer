package io.github.glaforge.agybrainviz;

import dev.langchain4j.model.output.structured.Description;

public record Issue(
    @Description("Error or exception encountered") String error,
    @Description("How the agent fixed or circumvented it") String circumvention
) {}
