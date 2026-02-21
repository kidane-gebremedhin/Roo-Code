# ARCHITECTURE_NOTES.md

## Section 1: Tool execution path
- The assistant streaming loop hands off tool blocks through [`presentAssistantMessage`](src/core/assistant-message/presentAssistantMessage.ts:299), which coordinates approvals, error handling, and invokes individual tool handlers.
- Each native tool is implemented as a subclass of [`BaseTool`](src/core/tools/BaseTool.ts:29); execution enters via `BaseTool.handle`, which parses `nativeArgs` and calls the concrete `execute` method.
- `execute_command` is handled by [`ExecuteCommandTool.execute`](src/core/tools/ExecuteCommandTool.ts:35), which delegates terminal orchestration to `executeCommandInTerminal` in the same file.
- `write_to_file` flows through [`WriteToFileTool.execute`](src/core/tools/WriteToFileTool.ts:29), coordinating diff presentation and approvals before writing.
- `apply_diff` is processed by [`ApplyDiffTool.execute`](src/core/tools/ApplyDiffTool.ts:27), leveraging the task’s configured diff strategy for patch application.
- Additional edit variants (e.g., `edit_file`, `apply_patch`, `search_replace`) follow the same `presentAssistantMessage` → `BaseTool.handle` → `Tool.execute` pipeline.

## Section 2: Prompt construction path
- System prompts are assembled by [`SYSTEM_PROMPT`](src/core/prompts/system.ts:112), which composes mode metadata, capabilities, and rule sections.
- Helper builders live under [`prompts/sections`](src/core/prompts/sections/index.ts:1); for example `getSharedToolUseSection` injects tool usage rules via [`tool-use`](src/core/prompts/sections/tool-use.ts:1).
- Extension-facing prompt creation is initiated from [`generateSystemPrompt`](src/core/webview/generateSystemPrompt.ts:42) and from the task’s [`buildSystemPrompt`](src/core/task/Task.ts:3783) call site.

## Section 3: Planned hook attach points
- **Hook Engine entry**: wrap `BaseTool.handle` in [`BaseTool`](src/core/tools/BaseTool.ts:113) to ensure every tool execution passes through centralized middleware.
- **Pre-hook intent handshake**: inject orchestrator logic immediately before the switch statement in [`presentAssistantMessage`](src/core/assistant-message/presentAssistantMessage.ts:299) to resolve `select_active_intent` prior to tool dispatch.
- **Post-hook capture**: append post-execution hooks in the callback closures passed to each tool (e.g., the `pushToolResult` definitions in the same file) to guarantee consistent ledger logging.
- **Reasoning loop prompt injection**: augment `SYSTEM_PROMPT` composition within [`prompts/system.ts`](src/core/prompts/system.ts:85) to include intent handshake and reasoning loop instructions alongside existing shared sections.

## Section 4: Planned sidecar files under .orchestration/
- `.orchestration/active_intents.yaml`: canonical record of task-owned scopes and currently selected intents.
- `.orchestration/hook_registry.json`: declarative configuration for hook middleware enabling/disabling specific pre/post behaviors.
- `.orchestration/agent_trace/agent_trace.jsonl`: append-only ledger capturing hooked tool events with optimistic locking.
- `.orchestration/lessons/CLAUDE.md`: auto-updated summary of verification outcomes and learned guardrails.

