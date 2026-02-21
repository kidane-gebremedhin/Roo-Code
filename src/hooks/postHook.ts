import type { ToolUse } from "../shared/tools"
import type { ToolParamName } from "../shared/tools"
import { appendTraceRecord } from "./traceLedger"

export async function runPostToolHook(toolUse: ToolUse): Promise<void> {
	if (toolUse.name !== "write_to_file") {
		return
	}
	const native = toolUse.nativeArgs as
		| { path?: string; content?: string; intent_id?: string; mutation_class?: string }
		| undefined
	const filePath = native?.path ?? toolUse.params?.["path" as ToolParamName]
	const content = native?.content ?? toolUse.params?.["content" as ToolParamName]
	const intentId = native?.intent_id ?? toolUse.params?.["intent_id" as ToolParamName]
	const mutationClass = native?.mutation_class ?? toolUse.params?.["mutation_class" as ToolParamName]
	if (!filePath || !content || !intentId || !mutationClass) {
		return
	}
	appendTraceRecord({
		relativePath: filePath,
		content,
		intentId,
		mutationClass,
	})
}
