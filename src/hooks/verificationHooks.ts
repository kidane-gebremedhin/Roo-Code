import { spawn } from "child_process"
import { promises as fs } from "fs"
import * as path from "path"

import type { Task } from "../core/task/Task"

const DEFAULT_SPECIFICATION_TAG = "TRP1-Week1-AI-Native-IDE"
const CLAUDE_LOG_PATH = path.join(".orchestration", "CLAUDE.md")
const MAX_OUTPUT_LENGTH = 4000

interface VerificationResult {
	passed: boolean
	output?: string
}

interface VerificationParams {
	path: string
	intentId: string
	content: string
}

export async function runVerificationPipeline(task: Task, params: VerificationParams): Promise<VerificationResult> {
	const result = await runTests(task)
	if (result.passed) {
		return result
	}

	await appendToClaudeLog({
		intentId: params.intentId,
		path: params.path,
		output: result.output ?? "",
	})

	return result
}

async function runTests(task: Task): Promise<VerificationResult> {
	return new Promise<VerificationResult>((resolve) => {
		const child = spawn("npm", ["test"], {
			cwd: task.cwd,
			shell: true,
		})
		let output = ""
		child.stdout?.on("data", (chunk) => {
			output += chunk.toString()
		})
		child.stderr?.on("data", (chunk) => {
			output += chunk.toString()
		})
		child.on("close", (code) => {
			resolve({
				passed: code === 0,
				output: truncateOutput(output),
			})
		})
		child.on("error", (error) => {
			resolve({ passed: false, output: truncateOutput(String(error)) })
		})
	})
}

function truncateOutput(text: string): string {
	if (text.length <= MAX_OUTPUT_LENGTH) {
		return text
	}
	return text.slice(0, MAX_OUTPUT_LENGTH) + "\n...<truncated>"
}

async function appendToClaudeLog(entry: { intentId: string; path: string; output: string }): Promise<void> {
	const timestamp = new Date().toISOString()
	const snippet = formatSummary(entry.output)
	const guidance = buildGuidance(entry)
	const logEntry = `## ${timestamp}
- Intent: ${entry.intentId}
- File: ${entry.path}
- Specification: ${DEFAULT_SPECIFICATION_TAG}
- Summary:

${snippet}

- Guidance:
${guidance.join("\n")}

---
`

	await fs.appendFile(CLAUDE_LOG_PATH, logEntry, "utf8").catch(async (error: any) => {
		if (error?.code === "ENOENT") {
			await fs.writeFile(CLAUDE_LOG_PATH, logEntry, "utf8")
			return
		}
		throw error
	})
}

function formatSummary(output: string): string {
	const snippet = output.trim().split("\n").slice(0, 20).join("\n")
	return "```\n" + snippet + "\n```"
}

function buildGuidance(entry: { intentId: string; output: string; path: string }): string[] {
	const bullets = [
		"- Revisit the acceptance_criteria in active_intents.yaml before retrying.",
		"- Plan a smaller change set to isolate the failure signal.",
		`- Verify impacted files (e.g., ${entry.path}) locally before the next mutation.`,
	]
	if (entry.output.toLowerCase().includes("timeout")) {
		bullets.push("- Consider running targeted tests to avoid hitting timeouts.")
	}
	return bullets
}
