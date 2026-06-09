"use strict";
var SmartCodeAnnotationsCore = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/diagram/annotations-core.ts
  var annotations_core_exports = {};
  __export(annotations_core_exports, {
    ANNOTATION_END: () => ANNOTATION_END,
    ANNOTATION_START: () => ANNOTATION_START,
    ANNOTATION_START_LEGACY: () => ANNOTATION_START_LEGACY,
    BREAKPOINT_REGEX: () => BREAKPOINT_REGEX,
    FLAG_REGEX: () => FLAG_REGEX,
    GHOST_REGEX: () => GHOST_REGEX,
    RISK_REGEX: () => RISK_REGEX,
    STATUS_REGEX: () => STATUS_REGEX,
    VALID_STATUSES: () => VALID_STATUSES,
    injectAnnotations: () => injectAnnotations,
    isAnnotationStart: () => isAnnotationStart,
    parseAllAnnotations: () => parseAllAnnotations,
    stripAnnotations: () => stripAnnotations
  });
  var ANNOTATION_START = "%% --- ANNOTATIONS (auto-managed by SmartCode) ---";
  var ANNOTATION_START_LEGACY = "%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---";
  var ANNOTATION_END = "%% --- END ANNOTATIONS ---";
  function isAnnotationStart(line) {
    return line === ANNOTATION_START || line === ANNOTATION_START_LEGACY;
  }
  var FLAG_REGEX = /^%%\s*@flag\s+(\S+)\s+"([^"]*)"$/;
  var STATUS_REGEX = /^%%\s*@status\s+(\S+)\s+(\S+)$/;
  var BREAKPOINT_REGEX = /^%%\s*@breakpoint\s+(\S+)$/;
  var RISK_REGEX = /^%%\s*@risk\s+(\S+)\s+(high|medium|low)\s+"([^"]*)"$/;
  var GHOST_REGEX = /^%%\s*@ghost\s+(\S+)\s+(\S+)\s+"([^"]*)"$/;
  var VALID_STATUSES = ["ok", "problem", "in-progress", "discarded"];
  function parseAllAnnotations(content, onUnrecognized) {
    const flags = /* @__PURE__ */ new Map();
    const statuses = /* @__PURE__ */ new Map();
    const breakpoints = /* @__PURE__ */ new Set();
    const risks = /* @__PURE__ */ new Map();
    const ghosts = [];
    const lines = content.split("\n");
    let inBlock = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (isAnnotationStart(trimmed)) {
        inBlock = true;
        continue;
      }
      if (trimmed === ANNOTATION_END) {
        inBlock = false;
        continue;
      }
      if (!inBlock || trimmed === "") continue;
      let match = FLAG_REGEX.exec(trimmed);
      if (match) {
        flags.set(match[1], { nodeId: match[1], message: match[2] });
        continue;
      }
      match = STATUS_REGEX.exec(trimmed);
      if (match) {
        const statusValue = match[2];
        if (VALID_STATUSES.includes(statusValue)) {
          statuses.set(match[1], statusValue);
        }
        continue;
      }
      match = BREAKPOINT_REGEX.exec(trimmed);
      if (match) {
        breakpoints.add(match[1]);
        continue;
      }
      match = RISK_REGEX.exec(trimmed);
      if (match) {
        risks.set(match[1], { nodeId: match[1], level: match[2], reason: match[3] });
        continue;
      }
      match = GHOST_REGEX.exec(trimmed);
      if (match) {
        ghosts.push({ fromNodeId: match[1], toNodeId: match[2], label: match[3] });
        continue;
      }
      onUnrecognized?.(trimmed);
    }
    return { flags, statuses, breakpoints, risks, ghosts };
  }
  function stripAnnotations(content) {
    const lines = content.split("\n");
    const result = [];
    let inBlock = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (isAnnotationStart(trimmed)) {
        inBlock = true;
        continue;
      }
      if (trimmed === ANNOTATION_END) {
        inBlock = false;
        continue;
      }
      if (!inBlock) {
        result.push(line);
      }
    }
    while (result.length > 0 && result[result.length - 1].trim() === "") {
      result.pop();
    }
    return result.join("\n") + "\n";
  }
  function injectAnnotations(content, ann) {
    const clean = stripAnnotations(content);
    const { flags, statuses, breakpoints, risks, ghosts } = ann;
    const hasFlags = flags.size > 0;
    const hasStatuses = statuses !== void 0 && statuses.size > 0;
    const hasBreakpoints = breakpoints !== void 0 && breakpoints.size > 0;
    const hasRisks = risks !== void 0 && risks.size > 0;
    const hasGhosts = ghosts !== void 0 && ghosts.length > 0;
    if (!hasFlags && !hasStatuses && !hasBreakpoints && !hasRisks && !hasGhosts) {
      return clean;
    }
    const lines = ["", ANNOTATION_START];
    for (const [nodeId, flag] of flags) {
      lines.push(`%% @flag ${nodeId} "${flag.message.replace(/"/g, "''")}"`);
    }
    if (hasStatuses) {
      for (const [nodeId, status] of statuses) {
        lines.push(`%% @status ${nodeId} ${status}`);
      }
    }
    if (hasBreakpoints) {
      for (const nodeId of breakpoints) {
        lines.push(`%% @breakpoint ${nodeId}`);
      }
    }
    if (hasRisks) {
      for (const [nodeId, risk] of risks) {
        lines.push(`%% @risk ${nodeId} ${risk.level} "${risk.reason.replace(/"/g, "''")}"`);
      }
    }
    if (hasGhosts) {
      for (const ghost of ghosts) {
        lines.push(`%% @ghost ${ghost.fromNodeId} ${ghost.toNodeId} "${ghost.label.replace(/"/g, "''")}"`);
      }
    }
    lines.push(ANNOTATION_END);
    lines.push("");
    return clean.trimEnd() + "\n" + lines.join("\n");
  }
  return __toCommonJS(annotations_core_exports);
})();
