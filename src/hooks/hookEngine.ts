import * as vscode from "vscode"

import type { ToolUse, ToolResponse } from "../shared/tools"
import { classifyTool } from "./commandClassifier"
import { runPreToolHook, getActiveIntent, guardMutatingTool } from "./preHook"
import { runPostToolHook } from "./postHook"
import type { Task } from "../core/task/Task"

export type ToolExecutor = (toolUse: ToolUse, pushResult: (content: ToolResponse) => void) => Promise<void>

export class HookEngine {
	private static instances = new WeakMap<Task, HookEngine>()

	static forTask(task: Task): HookEngine {
		let engine = HookEngine.instances.get(task)
		if (!engine) {
			engine = new HookEngine(task)
			HookEngine.instances.set(task, engine)
		}
		return engine
	}

	private constructor(private readonly task: Task) {}

	async runTool(
		toolUse: ToolUse,
		executor: ToolExecutor,
		pushToolResult: (content: ToolResponse) => void,
	): Promise<boolean> {
		const preHookResult = await runPreToolHook({ task: this.task, toolUse, pushToolResult })
		if (preHookResult.handled) {
			return false
		}

		const classification = classifyTool(toolUse)
		if (classification === "DESTRUCTIVE") {
			const guardResult = await guardMutatingTool(this.task, toolUse.name, pushToolResult, toolUse)
			if (guardResult.handled) {
				return false
			}

			const approved = await this.requestApproval(toolUse)
			if (!approved) {
				pushToolResult(
					JSON.stringify({
						type: "tool_error",
						tool: toolUse.name,
						message:
							"Destructive operation rejected by human reviewer. Please propose a safer alternative.",
					}),
				)
				return false
			}
		}

		await executor(toolUse, pushToolResult)
		await runPostToolHook(toolUse)
		return true
	}

	private async requestApproval(toolUse: ToolUse): Promise<boolean> {
		const intent = getActiveIntent(this.task)
		const scopeNotice = intent
			? `Intent ${intent.id} (${intent.name}) scoped to ${intent.owned_scope.join(", ")}`
			: "No intent context available"
		const message = `Destructive tool detected: ${toolUse.name}.
${scopeNotice}
Approve execution?`
		const result = await vscode.window.showWarningMessage(message, { modal: true }, "Approve", "Reject")
		return result === "Approve"
	}
}
