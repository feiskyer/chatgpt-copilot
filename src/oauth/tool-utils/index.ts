export {
  cacheSignature,
  getCachedSignature,
  clearSignatureCache,
  buildSignatureSessionKey,
  getSignatureCacheStats,
  cleanupExpiredSignatures,
} from "./signature-cache";

export {
  CLAUDE_TOOL_SYSTEM_INSTRUCTION,
  injectParameterSignatures,
  injectToolHardeningInstruction,
  hasToolUse,
} from "./tool-hardening";

export {
  assignToolCallIds,
  matchToolResponseIds,
  fixToolResponseGrouping,
  processToolCallPairing,
  extractToolCallsFromContent,
  createToolResponseContent,
} from "./tool-pairing";

export {
  cleanJSONSchemaForProviders,
  cleanToolSchemas,
  isEmptySchema,
} from "./schema-cleaning";

export {
  filterUnsignedThinkingBlocks,
  ensureThinkingBeforeToolUse,
  needsThinkingWarmup,
  handleThinkingRecovery,
  extractThinkingFromClaudeResponse,
  extractThinkingFromGeminiResponse,
  cacheThinkingSignatures,
  cacheThinkingSignaturesFromChunk,
} from "./thinking-blocks";
