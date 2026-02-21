import type { Task } from "../core/task/Task"
import type { ToolUse } from "../shared/tools"
import type { NativeToolArgs, ToolResponse, ToolParamName } from "../shared/tools"
import { findIntentById, type ActiveIntent, isPathInScope } from "./intentStore"
import { getOptimisticLockManager } from "./optimisticLocking"

interface PreHookArgs<TName extends keyof NativeToolArgs | string = string> {
	task: Task
	toolUse: ToolUse<TName extends keyof NativeToolArgs ? TName : any>
	pushToolResult: (content: ToolResponse) => void
}

interface PreHookResult {
	handled: boolean
	didPushResult?: boolean
}

const activeIntentSelections = new WeakMap<Task, ActiveIntent>()

export function getActiveIntent(task: Task): ActiveIntent | undefined {
 return activeIntentSelections.get(task)
}

export async function runPreToolHook({ task, toolUse, pushToolResult }: PreHookArgs): Promise<PreHookResult> {
	if (toolUse.partial) {
		return { handled: false }
	}

	if (toolUse.name === "read_file") {
		const lockManager = getOptimisticLockManager(task)
		const targetPath = extractTargetPath(toolUse)
		if (targetPath) {
			await lockManager.recordBaseline(targetPath)
		}
		return { handled: false }
	}

	if (toolUse.name === "write_to_file") {
		const lockManager = getOptimisticLockManager(task)
		const targetPath = extractTargetPath(toolUse)
		if (targetPath) {
			const stale = await lockManager.isStale(targetPath)
			if (stale) {
				pushToolResult(
					JSON.stringify({
						type: "tool_error",
						tool: "write_to_file",
						message: "Stale File: The file has changed since you last read it. Please re-read the file and re-plan your changes.",
					}),
				)
				task.consecutiveMistakeCount++
				task.recordToolError?.("write_to_file" as any, "stale_file")
				return { handled: true, didPushResult: true }
			}
		}
	}

	if (toolUse.name !== "select_active_intent") {
		return { handled: false }
	}

	const nativeArgs = toolUse.nativeArgs as NativeToolArgs["select_active_intent"] | undefined
const paramIntentId = toolUse.params?.["intent_id" as ToolParamName]
	const intentId = (nativeArgs?.intent_id ?? paramIntentId)?.toString().trim()

	if (!intentId) {
		pushToolResult(
			JSON.stringify({
				type: "tool_error",
				tool: "select_active_intent",
				message: "You must cite a valid active Intent ID.",
			}),
		)
		task.consecutiveMistakeCount++
		task.recordToolError?.("select_active_intent", "missing_intent_id")
		return { handled: true, didPushResult: true }
	}

	const intent = await findIntentById(intentId)

	if (!intent) {
		pushToolResult(
			JSON.stringify({
				type: "tool_error",
				tool: "select_active_intent",
				message: "You must cite a valid active Intent ID.",
			}),
		)
		task.consecutiveMistakeCount++
		task.recordToolError?.("select_active_intent", "invalid_intent_id")
		return { handled: true, didPushResult: true }
	}

	activeIntentSelections.set(task, intent)
	if (task.consecutiveMistakeCount > 0) {
		task.consecutiveMistakeCount = 0
	}

	const xml = buildIntentContextXml(intent)
	pushToolResult(xml)
	return { handled: true, didPushResult: true }
}

export async function guardMutatingTool(
	task: Task,
	toolName: string,
	pushToolResult: (content: ToolResponse) => void,
	toolUse: ToolUse,
): Promise<PreHookResult> {
	const selectedIntent = activeIntentSelections.get(task)
	if (!selectedIntent) {
		pushToolResult(
			JSON.stringify({
				type: "tool_error",
				tool: toolName,
				message: "No active intent selected. You must call select_active_intent(intent_id) first.",
			}),
		)
		task.consecutiveMistakeCount++
		task.recordToolError?.(toolName as any, "missing_active_intent")
		return { handled: true, didPushResult: true }
	}

	const validatedIntent = await findIntentById(selectedIntent.id)
	if (!validatedIntent) {
		activeIntentSelections.delete(task)
		pushToolResult(
			JSON.stringify({
				type: "tool_error",
				tool: toolName,
				message: "Active intent not found in active_intents.yaml. Please choose a valid intent.",
			}),
		)
		task.consecutiveMistakeCount++
		task.recordToolError?.(toolName as any, "stale_active_intent")
		return { handled: true, didPushResult: true }
	}

  activeIntentSelections.set(task, validatedIntent)

  const targetPath = extractTargetPath(toolUse)
  if (targetPath && !isPathInScope(validatedIntent, targetPath)) {
		pushToolResult(
			JSON.stringify({
				type: "tool_error",
				tool: toolName,
				message: `Scope Violation: ${validatedIntent.id} is not authorized to edit ${targetPath}. Request scope expansion.`,
			}),
		)
		task.consecutiveMistakeCount++
		task.recordToolError?.(toolName as any, "scope_violation")
		return { handled: true, didPushResult: true }
	}

  if (toolName === "write_to_file" && !validateIntentMetadata(toolUse, validatedIntent, pushToolResult, task)) {
		return { handled: true, didPushResult: true }
	}

  return { handled: false }
}

function extractTargetPath(toolUse: ToolUse): string | undefined {
	const native = toolUse.nativeArgs as any
	return native?.path ?? native?.file_path ?? toolUse.params?.path ?? toolUse.params?.file_path ?? undefined
}

function validateIntentMetadata(
	toolUse: ToolUse,
	intent: ActiveIntent,
	pushToolResult: (content: ToolResponse) => void,
	task: Task,
): boolean {
	const native = toolUse.nativeArgs as any
 const intentIdArg = native?.intent_id ?? toolUse.params?.["intent_id" as ToolParamName]
 const mutationClassArg = native?.mutation_class ?? toolUse.params?.["mutation_class" as ToolParamName]

	if (!intentIdArg || intentIdArg !== intent.id) {
		pushToolResult(
			JSON.stringify({
				type: "tool_error",
				tool: toolUse.name,
				message: `Intent mismatch: expected ${intent.id}, but received ${intentIdArg ?? "(missing)"}.`,
			}),
		)
		task.consecutiveMistakeCount++
		task.recordToolError?.(toolUse.name as any, "intent_mismatch")
		return false
	}

	if (!mutationClassArg || !["AST_REFACTOR", "INTENT_EVOLUTION", "DOC_UPDATE"].includes(mutationClassArg)) {
		pushToolResult(
			JSON.stringify({
				type: "tool_error",
				tool: toolUse.name,
				message: "Invalid mutation_class. Must be AST_REFACTOR, INTENT_EVOLUTION, or DOC_UPDATE.",
			}),
		)
		task.consecutiveMistakeCount++
		task.recordToolError?.(toolUse.name as any, "invalid_mutation_class")
		return false
	}

	return true
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
}

function buildIntentContextXml(intent: ActiveIntent): string {
	const ownedScope = intent.owned_scope
		.map((pattern) => `  <pattern>${escapeXml(pattern)}</pattern>`) 
		.join("\n")
	const constraints = intent.constraints
		.map((constraint) => `  <item>${escapeXml(constraint)}</item>`)
		.join("\n")
	const acceptance = intent.acceptance_criteria
		.map((criterion) => `  <item>${escapeXml(criterion)}</item>`)
		.join("\n")

	return [
		"<intent_context>",
		`  <id>${escapeXml(intent.id)}</id>`,
		`  <name>${escapeXml(intent.name)}</name>`,
		`  <status>${escapeXml(intent.status)}</status>`,
		"  <owned_scope>",
		ownedScope || "",
		"  </owned_scope>",
		"  <constraints>",
		constraints || "",
		"  </constraints>",
		"  <acceptance_criteria>",
		acceptance || "",
		"  </acceptance_criteria>",
		"</intent_context>",
	]
		.filter((line) => line !== "")
		.join("\n")
}
