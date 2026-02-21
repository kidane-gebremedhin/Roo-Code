const selectActiveIntent = {
	type: "function",
	function: {
		name: "select_active_intent",
		description:
			"Declare which active intent is being pursued before any other tool execution. Must be called with an intent_id present in .orchestration/active_intents.yaml.",
		parameters: {
			type: "object",
			required: ["intent_id"],
			properties: {
				intent_id: {
					type: "string",
					description: "Identifier of the intent to mark as active (e.g., INT-001).",
				},
			},
		},
	},
	strict: true,
	additionalProperties: false,
} as const

export default selectActiveIntent
