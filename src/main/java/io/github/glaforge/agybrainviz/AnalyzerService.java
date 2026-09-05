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

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;
import io.micronaut.langchain4j.annotation.AiService;

@AiService
public interface AnalyzerService {
    @SystemMessage("""
			You are an expert at analyzing JSONL transcripts of Antigravity sessions.
			Your job is to extract the core insights, actions, issues, and actionable recommendations
			(e.g. missing tools, helpful skills to create, or AGENTS.md advice) into a structured JSON format.

			Your output MUST be a valid JSON object strictly containing ALL of the following fields:
			{
			  "shortTitle": "Concise title summarizing session (max 50 chars)",
			  "flow": [
			    "Description of major step 1",
			    "Description of major step 2"
			  ],
			  "agentActions": [
			    {
			      "action": "view_file",
			      "description": "Short explanation of the action"
			    }
			  ],
			  "issues": [
			    {
			      "error": "Error or obstacle encountered",
			      "circumvention": "How the agent resolved or bypassed the issue"
			    }
			  ],
			  "recommendations": [
			    "Suggested tip, custom skill, or AGENTS.md rule"
			  ],
			  "summary": "Coherent overview explaining the overall session outcome."
			}

			CRITICAL RULES:
			- Do NOT omit any fields. All 6 fields ("shortTitle", "flow", "agentActions", "issues", "recommendations", "summary") are mandatory in the JSON response.
			- If there are no issues or recommendations, return an empty array [] for that field.
			- Always extract the agent's key actions into "agentActions" and the chronological sequence into "flow".
			- Keep the summary focused, natural, and concise. Do NOT add repetitive word chains or artificial filler.
			""")
    @UserMessage("""
			Please analyze the following JSONL transcript of an Antigravity session.

			INSTRUCTIONS:
			- Output MUST be a complete JSON object containing all 6 fields: shortTitle, flow, agentActions, issues, recommendations, summary.
			- Do not leave flow or agentActions empty if actions occurred in the transcript.
			- Be succinct and concise in your descriptions.
			- Output MUST be exclusively in English.
			- Avoid redundant repetition or repetitive filler words in the summary.

			Transcript:
			{{transcript}}
			""")
    AnalysisResponse analyze(@V("transcript") String transcript);

    @UserMessage("""
			Here is the structured analysis from the previous parts of the conversation:

			{{previousAnalysis}}

			Please update and enhance this analysis using the next section of the transcript below.
			INSTRUCTIONS:
			- Output MUST be valid JSON strictly adhering to the schema.
			- Incorporate the new context into the existing analysis.
			- Merge new elements concisely without duplicating existing items.
			- Update the `summary` to reflect the accumulated narrative from the beginning of the session up to this chunk.
			- Output MUST be exclusively in English.
			- Avoid redundant repetition or repetitive filler words in the summary.

			New Transcript Chunk:
			{{transcript}}
			""")
    AnalysisResponse refineAnalysis(
        @V("previousAnalysis") String previousAnalysis,
        @V("transcript") String transcript
    );

    @UserMessage("""
			Here is a list of partial structured analysis objects, each corresponding to a distinct segment of the same session:

			{{combinedSummariesJson}}

			Please consolidate them into a single, unified, and comprehensive structured analysis.
			INSTRUCTIONS:
			- Output MUST be valid JSON strictly adhering to the schema.
			- Merge items thoughtfully, avoiding duplicate issues or actions.
			- Ensure your summary provides a clear overarching narrative of the entire session.
			- Output MUST be exclusively in English.
			- Avoid redundant repetition or repetitive filler words in the summary.
			""")
    AnalysisResponse consolidateAnalysis(@V("combinedSummariesJson") String combinedSummariesJson);
}
