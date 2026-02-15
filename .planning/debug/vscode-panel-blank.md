---
status: verifying
trigger: "VS Code extension sidebar panel shows blank/black screen while browser localhost UI works fine"
created: 2026-02-15T14:00:00Z
updated: 2026-02-15T14:47:00Z
---

## Current Focus

hypothesis: CONFIRMED - fix applied and bundle rebuilt
test: User needs to install updated .vsix and verify diagram renders in sidebar
expecting: Diagram should render correctly in VS Code sidebar panel
next_action: User verification - install .vsix, open sidebar, confirm diagram renders

## Symptoms

expected: When clicking the SmartB Diagrams icon in VS Code sidebar, the panel should show a rendered Mermaid diagram with connection status indicator.
actual: The panel opens but shows a completely blank/black screen. No text, no diagram, no error messages visible.
errors: No visible error messages. CSP violations likely in DevTools console.
reproduction: Start smartb server, open VS Code with extension, click SmartB Diagrams icon in activity bar.
started: Never worked - extension was just built (Phase 7).

## Eliminated

- hypothesis: CSS height/overflow causing invisible content
  evidence: Changed height:100vh+overflow:hidden to min-height:200px+overflow:auto+height:100% - did NOT fix
  timestamp: 2026-02-15 (prior investigation)

## Evidence

- timestamp: 2026-02-15T14:00:00Z
  checked: diagram-provider.ts CSP policy (lines 83-89)
  found: CSP has `default-src 'none'` with NO `frame-src` directive
  implication: mermaid sandbox mode creates iframes which are blocked by default-src 'none'

- timestamp: 2026-02-15T14:00:00Z
  checked: main.ts mermaid.initialize config (line 87)
  found: securityLevel set to 'sandbox' which creates temporary iframe for rendering
  implication: mermaid.render() fails silently or throws when iframe creation blocked by CSP

- timestamp: 2026-02-15T14:00:00Z
  checked: esbuild.mjs webview config (line 27)
  found: mermaid is listed as external in IIFE bundle
  implication: In IIFE format, esbuild generates `var mermaid = require("mermaid")` or similar - need to check actual output

- timestamp: 2026-02-15T14:00:00Z
  checked: compiled webview.js
  found: The code calls `mermaid.initialize(...)` directly as a global reference - no require/import wrapper
  implication: Global mermaid from separate script tag SHOULD work, but need to verify esbuild external handling for IIFE

- timestamp: 2026-02-15T14:01:00Z
  checked: HTML structure in diagram-provider.ts (lines 105-106)
  found: mermaid.min.js loaded BEFORE webview.js via script tags with nonce
  implication: Load order is correct - mermaid global should be available when webview.js executes

- timestamp: 2026-02-15T14:05:00Z
  checked: mermaid.min.js internal render function (Dat at index ~2747670)
  found: When securityLevel==='sandbox', mermaid calls P3e("sandboxedIframe") which does `t.append("iframe").attr("id",e).attr("sandbox","")`, then accesses iframe.contentDocument.body for rendering
  implication: CONFIRMED ROOT CAUSE - iframe creation blocked by CSP, render fails silently, blank panel

- timestamp: 2026-02-15T14:05:00Z
  checked: esbuild external handling for IIFE format
  found: With `declare const mermaid` pattern (no import), esbuild just references global directly. Compiled webview.js shows `mermaid.initialize(...)` as bare global
  implication: RULED OUT as issue - mermaid global IS accessible from script tag load order

- timestamp: 2026-02-15T14:47:00Z
  checked: Source main.ts vs compiled media/webview.js
  found: Source had securityLevel:'loose' (fix was applied to source in prior session) but compiled webview.js still had securityLevel:"sandbox" - bundle was STALE, never rebuilt
  implication: The fix existed in source but was not active. Rebuilding with `node esbuild.mjs` produced correct output with securityLevel:"loose"

- timestamp: 2026-02-15T14:47:00Z
  checked: diagram-provider.ts CSP policy for 'loose' mode compatibility
  found: CSP has style-src with 'unsafe-inline' (required for mermaid SVG inline styles), script-src with nonce, img-src with data: (for mermaid data URIs). No frame-src needed since 'loose' mode does not create iframes.
  implication: Existing CSP is fully compatible with mermaid 'loose' mode. No CSP changes needed.

## Resolution

root_cause: mermaid.initialize({securityLevel:'sandbox'}) causes mermaid.render() to create a temporary iframe for sandboxed SVG rendering. The VS Code webview CSP has `default-src 'none'` without any `frame-src` directive, which silently blocks iframe creation. The render function then fails (either throws or returns empty) because it cannot access the iframe's contentDocument. The entire diagram container stays empty -> blank panel.
fix: Changed securityLevel from 'sandbox' to 'loose' in main.ts (line 91). Added explanatory comment documenting WHY 'loose' is required (lines 84-87). Rebuilt webview bundle (media/webview.js) and .vsix package. The 'loose' mode renders SVG directly into DOM without iframe isolation, compatible with VS Code webview CSP. No changes needed to diagram-provider.ts CSP since 'loose' mode does not require frame-src.
verification: PENDING - user must install updated .vsix and confirm diagram renders in sidebar
files_changed:
  - vscode-extension/src/webview/main.ts (securityLevel: 'sandbox' -> 'loose', added comment)
  - vscode-extension/media/webview.js (rebuilt bundle)
  - vscode-extension/media/webview.js.map (rebuilt sourcemap)
  - vscode-extension/smartb-diagrams-vscode-0.1.0.vsix (rebuilt package)
