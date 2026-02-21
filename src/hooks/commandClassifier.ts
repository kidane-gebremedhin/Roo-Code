import type { ToolUse } from "../shared/tools"

export type CommandClassification = "SAFE" | "DESTRUCTIVE" | "UNKNOWN"

export const SAFE_TOOL_NAMES = new Set<string>([
	"read_file",
	"list_files",
	"read_command_output",
	"codebase_search",
	"search_files",
	"ask_followup_question",
	"skill",
	"attempt_completion",
	"new_task",
	"switch_mode",
	"update_todo_list",
	"run_slash_command",
	"generate_image",
])

export const MUTATING_TOOL_NAMES = new Set<string>([
	"write_to_file",
	"write_file",
	"apply_diff",
	"apply_edit",
	"apply_patch",
	"edit_file",
	"search_replace",
	"search_and_replace",
	"edit",
	"execute_command",
])

const DESTRUCTIVE_SHELL_PATTERNS = [
	/(^|\s)rm\s/i,
	/(^|\s)rimraf\b/i,
	/(^|\s)rmdir\b/i,
	/(^|\s)del\b/i,
	/(^|\s)truncate\b/i,
	/(^|\s)drop\s+database/i,
	/(^|\s)drop\s+table/i,
	/(^|\s)git\s+reset\s+--hard/i,
	/(^|\s)git\s+clean\s+-/i,
]

export function classifyTool(toolUse: ToolUse): CommandClassification {
	const name = toolUse.name

	if (SAFE_TOOL_NAMES.has(name)) {
		return "SAFE"
	}

	if (MUTATING_TOOL_NAMES.has(name)) {
		if (name === "execute_command") {
			const command =
				(toolUse.nativeArgs as any)?.command ??
				(toolUse.params?.command as string | undefined) ??
				""
			if (command) {
				for (const pattern of DESTRUCTIVE_SHELL_PATTERNS) {
					if (pattern.test(command)) {
						return "DESTRUCTIVE"
					}
				}
			}
			return "UNKNOWN"
		}
		return "DESTRUCTIVE"
	}

	return "UNKNOWN"
}
