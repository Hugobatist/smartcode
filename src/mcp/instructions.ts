/**
 * MCP server instructions sent to AI clients on connection.
 * Teaches the AI HOW to use SmartB Diagrams effectively —
 * optimized for minimal tool calls and maximum proactive usage.
 */
export const MCP_INSTRUCTIONS = `
# SmartB Diagrams — Show Your Reasoning Visually

You have SmartB Diagrams. Use it to show the developer your reasoning in real-time
as a visual flowchart in their browser. ONE tool call = complete diagram with colors,
risks, and rejected alternatives.

## When to Use (PROACTIVELY, without being asked)

- Planning any implementation with 3+ steps
- Debugging: show your hypothesis tree
- Refactoring: show before/after or decision points
- Architecture analysis: show components and data flow
- Any task where visualizing your plan prevents wasted effort

Do NOT use for: one-line fixes, simple answers, obvious tasks.

## How to Use: ONE Call Does Everything

\`update_diagram\` accepts everything at once — diagram + annotations:

\`\`\`json
{
  "filePath": "reasoning.mmd",
  "content": "flowchart TD\\n  ANALYZE[\\"Analyze Code\\"] --> PLAN[\\"Create Plan\\"]\\n  PLAN --> IMPL[\\"Implement\\"]\\n  IMPL --> TEST[\\"Run Tests\\"]",
  "nodeStatuses": {
    "ANALYZE": "ok",
    "PLAN": "in-progress",
    "IMPL": "problem"
  },
  "riskLevels": {
    "IMPL": { "level": "high", "reason": "Touches auth module, could break login flow" }
  },
  "ghostPaths": [
    { "from": "ANALYZE", "to": "IMPL", "label": "Skip planning: rejected, too complex" }
  ]
}
\`\`\`

### Status Colors (nodeStatuses)
- **"ok"** (green) = verified, working, done
- **"in-progress"** (yellow) = currently working on this
- **"problem"** (red) = found issue, needs attention
- **"discarded"** (gray) = ruled out, not pursuing

### Risk Levels (riskLevels)
- **"high"** = likely bugs, edge cases, or failures — ALWAYS explain why
- **"medium"** = moderate complexity, worth watching
- **"low"** = straightforward

### Ghost Paths (ghostPaths)
Alternatives you considered but rejected. Include WHY you rejected them.

## Diagram Design Rules

- **Max 15 nodes** — be concise, not comprehensive
- **Short labels** — "Validate Input" not "Validate all user input fields and return errors"
- **Meaningful IDs** — use \`VALIDATE\` not \`A\` or \`node1\`
- **Use subgraphs** to group phases
- **TD** for sequential flows, **LR** for comparison/parallel

## Workflow During a Task

1. **Before coding**: Create diagram showing your plan with status colors
2. **As you work**: Update the diagram — change statuses from "in-progress" to "ok" or "problem"
3. **When done**: Final update with all nodes green (ok) or red (problem)

Each update is ONE \`update_diagram\` call — fast and fluid.

## Incremental Updates

For small changes to an existing diagram, you can also use:
- \`update_node_status\` — change one node's color
- \`set_risk_level\` — add/change one risk assessment
- \`record_ghost_path\` — add one rejected alternative

But prefer \`update_diagram\` for initial creation and major updates.

## Developer Feedback (Flags)

Use \`read_flags\` to check if the developer flagged any nodes for correction.
If flags exist, use \`get_correction_context\` to understand what they want.

## Sessions (Optional, for long tasks)

For tasks spanning many steps, use sessions to generate heatmaps:
- \`start_session\` → \`record_step\` per node → \`end_session\`

## Breakpoints

If \`check_breakpoints\` returns "pause", STOP and wait for the developer.
`.trim();
