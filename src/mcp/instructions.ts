/**
 * MCP server instructions sent to AI clients on connection.
 * Teaches the AI HOW to use SmartB Diagrams effectively —
 * not just what each tool does, but the workflow and best practices.
 */
export const MCP_INSTRUCTIONS = `
# SmartB Diagrams — AI Observability for Mermaid Diagrams

You have access to SmartB Diagrams, a tool that lets you show your reasoning visually
to the developer while you work. The developer sees your diagrams in real-time in their
browser or IDE panel.

## CRITICAL: This is NOT just a Mermaid renderer

SmartB is an **observability and communication tool**. The value is NOT in rendering
a diagram — the value is in showing the developer:
- WHERE you are in a process (node status colors)
- WHAT risks you identified (risk levels with reasons)
- WHAT alternatives you considered and rejected (ghost paths)
- WHERE the developer should pay attention (problems, high risk)

## When to Use SmartB

Use SmartB PROACTIVELY (without being asked) when:
- Planning a complex implementation (3+ steps)
- Analyzing an algorithm or architecture
- Debugging a multi-step issue
- Refactoring with multiple options
- Any task where showing your plan BEFORE coding prevents wasted effort

Do NOT use SmartB for:
- Simple one-line fixes
- Answering questions that don't involve code changes
- Tasks where the approach is obvious

## Required Workflow (follow this order)

### Step 1: Create a CLEAN diagram
- Use \`update_diagram\` to create a concise flowchart
- Keep it readable: 10-20 nodes max, not 50+
- Use clear short labels, not paragraphs in nodes
- Prefer TD (top-down) direction for sequential flows
- Use subgraphs to group related steps

### Step 2: Mark status on nodes (ALWAYS do this)
- Use \`update_node_status\` on relevant nodes:
  - "ok" (green) = verified, working, no issues
  - "in-progress" (yellow) = currently analyzing or implementing
  - "problem" (red) = found an issue, needs attention
  - "discarded" (gray) = ruled out, not pursuing
- This gives the developer instant visual feedback

### Step 3: Set risk levels on complex nodes (ALWAYS do this)
- Use \`set_risk_level\` on nodes that have non-obvious complexity:
  - "high" = likely source of bugs, edge cases, or failures
  - "medium" = moderate complexity, worth watching
  - "low" = straightforward, unlikely to cause issues
- ALWAYS include a \`reason\` explaining WHY — this is the most valuable part

### Step 4: Record ghost paths for rejected alternatives
- Use \`record_ghost_path\` when you consider an approach but reject it
- Include a label explaining WHY you rejected it
- This shows the developer you considered alternatives

### Step 5: Check for developer feedback
- Use \`read_flags\` to check if the developer flagged any nodes
- If flags exist, use \`get_correction_context\` to understand what they want
- Adjust your approach based on their feedback

### Step 6: For long-running tasks, use sessions
- \`start_session\` at the beginning
- \`record_step\` as you work through each node
- \`end_session\` when done — this generates a heatmap

## Diagram Design Best Practices

- **Max 20 nodes** — if you need more, split into multiple diagrams
- **Short labels** — "Validate Input" not "Validate all user input fields and return errors"
- **Node IDs should be meaningful** — use \`VALIDATE\` not \`A\` or \`node1\`
- **Use subgraphs** to group phases or modules
- **Prefer flowchart TD** for sequential processes, **LR** for parallel/comparison

## Example of Good vs Bad Usage

BAD (just a renderer):
1. Create giant 50-node diagram with all details crammed in
2. No status colors, no risk levels
3. Developer gets a wall of blue boxes

GOOD (observability tool):
1. Create clean 15-node diagram showing key decision points
2. Mark nodes: green (verified), yellow (analyzing), red (found issue)
3. Set risk levels: "high — division by zero if all inputs are 0"
4. Ghost path: "Considered using recursion, rejected: stack overflow risk"
5. Developer sees at a glance where attention is needed

## Breakpoints

If the developer sets a breakpoint on a node, \`check_breakpoints\` returns "pause".
When paused, STOP and wait. Do not proceed until the developer clicks "Continue"
and the next check returns "continue".
`.trim();
