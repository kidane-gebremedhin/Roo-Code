import { promises as fs } from "fs"
import * as path from "path"
import crypto from "crypto"

import type { Task } from "../core/task/Task"

class OptimisticLockManager {
	private baselines = new Map<string, string>()

	constructor(private readonly task: Task) {}

	async recordBaseline(relPath: string): Promise<void> {
		const absolutePath = path.join(this.task.cwd, relPath)
		try {
			const content = await fs.readFile(absolutePath)
			const hash = this.hashBuffer(content)
			this.baselines.set(relPath, hash)
		} catch (error: any) {
			if (error?.code === "ENOENT") {
				// File does not exist yet; treat as no baseline.
				this.baselines.delete(relPath)
				return
			}
			throw error
		}
	}

	async isStale(relPath: string): Promise<boolean> {
		const baselineHash = this.baselines.get(relPath)
		if (!baselineHash) {
			return false
		}
		const absolutePath = path.join(this.task.cwd, relPath)
		try {
			const content = await fs.readFile(absolutePath)
			const currentHash = this.hashBuffer(content)
			return currentHash !== baselineHash
		} catch (error: any) {
			// If file disappears, treat as stale to force re-read
			if (error?.code === "ENOENT") {
				return true
			}
			throw error
		}
	}

	private hashBuffer(buffer: Buffer): string {
		return crypto.createHash("sha256").update(buffer).digest("hex")
	}
}

const managers = new WeakMap<Task, OptimisticLockManager>()

export function getOptimisticLockManager(task: Task): OptimisticLockManager {
	let manager = managers.get(task)
	if (!manager) {
		manager = new OptimisticLockManager(task)
		managers.set(task, manager)
	}
	return manager
}
