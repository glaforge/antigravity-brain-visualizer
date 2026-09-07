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
			You are an expert at analyzing transcripts of Antigravity AI agent sessions.
			Your job is to extract the core insights, actions, issues, and actionable recommendations
			(e.g. missing tools, helpful skills to create, or AGENTS.md advice) into a structured JSON format.

			The transcript contains:
			- USER REQUEST: The prompt or task given by the user.
			- AGENT ACTION: Tool invocations with their action descriptions and targets.
			- AGENT RESPONSE: Direct assistant text answers, findings, and explanations.
			- TOOL RESULT / ERROR: Key outputs or errors from executed commands and tools.

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
			- Incorporate both agent actions and direct agent responses/conclusions into the flow and summary.
			- Keep the summary focused, natural, and concise. Do NOT add repetitive word chains or artificial filler.
			""")
    @UserMessage("""
			Please analyze the following transcript of an Antigravity session.

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
}
