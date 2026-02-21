import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"
import * as vscode from "vscode"
import { execSync } from "child_process"

const ORCH_DIR = ".orchestration"
const TRACE_FILE = "agent_trace.jsonl"

/**
 * Generate SHA-256 hash of content
 */
export function generateContentHash(content: string): string {
	return "sha256:" + crypto.createHash("sha256").update(content).digest("hex")
}

/**
 * Get current git revision (if available)
 */
function getGitRevision(root: string): string | null {
	try {
		return execSync("git rev-parse HEAD", { cwd: root }).toString().trim()
	} catch {
		return null
	}
}

/**
 * Append trace record to JSONL ledger
 */
export function appendTraceRecord(params: {
	relativePath: string
	content: string
	intentId: string
	mutationClass: string
}) {
	const workspace = vscode.workspace.workspaceFolders?.[0]
	if (!workspace) return

	const root = workspace.uri.fsPath
	const traceDir = path.join(root, ORCH_DIR)
	const tracePath = path.join(traceDir, TRACE_FILE)

	// Ensure .orchestration exists
	if (!fs.existsSync(traceDir)) {
		fs.mkdirSync(traceDir)
	}

	const contentHash = generateContentHash(params.content)
	const revision = getGitRevision(root)

	const record = {
		id: crypto.randomUUID(),
		timestamp: new Date().toISOString(),
		version: "1.0.0",
		vcs: {
			type: "git",
			revision: revision,
		},
		files: [
			{
				relative_path: params.relativePath,
				conversations: [
					{
						contributor: {
							entity_type: "AI",
							model_identifier: "openai-api",
						},
						intent_id: params.intentId,
						mutation_class: params.mutationClass,
						ranges: [
							{
								start_line: 1,
								end_line: params.content.split("\n").length,
								content_hash: contentHash,
							},
						],
						related: [
							{
								type: "intent",
								value: params.intentId,
							},
							{
								type: "specification",
								value: "TRP1-Week1-AI-Native-IDE",
							},
						],
					},
				],
			},
		],
	}

	fs.appendFileSync(tracePath, JSON.stringify(record) + "\n", "utf8")
}
