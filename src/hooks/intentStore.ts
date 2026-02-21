import { promises as fs } from "fs"
import * as path from "path"
import * as yaml from "yaml"
import minimatch from "minimatch"

export interface ActiveIntent {
	id: string
	name: string
	status: "TODO" | "IN_PROGRESS" | "DONE"
	owned_scope: string[]
	constraints: string[]
	acceptance_criteria: string[]
}

export interface IntentState {
	active_intents: ActiveIntent[]
}

const ORCHESTRATION_DIR = ".orchestration"
const ACTIVE_INTENTS_FILE = "active_intents.yaml"

function getActiveIntentsPath(): string {
	return path.join(process.cwd(), ORCHESTRATION_DIR, ACTIVE_INTENTS_FILE)
}

export async function loadIntentState(): Promise<IntentState> {
	const filePath = getActiveIntentsPath()
	const content = await fs.readFile(filePath, "utf8")
	return yaml.parse(content) as IntentState
}

export async function findIntentById(id: string): Promise<ActiveIntent | undefined> {
 const state = await loadIntentState()
 return state.active_intents.find((intent) => intent.id === id)
}

export function isPathInScope(intent: ActiveIntent, targetPath: string): boolean {
	for (const pattern of intent.owned_scope) {
		if (minimatch(targetPath, pattern, { dot: true })) {
			return true
		}
	}
	return false
}
