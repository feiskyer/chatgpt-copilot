import * as vscode from "vscode";
import {
  ALL_OAUTH_PROVIDERS,
  OAuthModelInfo,
  OAuthProviderType,
  OAUTH_MODEL_PREFIXES,
} from "./types";
import { fetchAvailableModels } from "./providers/antigravity";
import { getValidToken } from "./token-storage";

const MODEL_CACHE_KEY = "oauth-model-cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedModels {
  models: OAuthModelInfo[];
  timestamp: number;
}

let globalState: vscode.Memento | null = null;

export function initializeModelCache(context: vscode.ExtensionContext): void {
  globalState = context.globalState;
}

function getGlobalState(): vscode.Memento {
  if (!globalState) {
    throw new Error(
      "Model cache not initialized. Call initializeModelCache first.",
    );
  }
  return globalState;
}

function getCacheKey(provider: OAuthProviderType): string {
  return `${MODEL_CACHE_KEY}-${provider}`;
}

export async function getCachedModels(
  provider: OAuthProviderType,
): Promise<OAuthModelInfo[] | null> {
  const state = getGlobalState();
  const cached = state.get<CachedModels>(getCacheKey(provider));

  if (!cached) {
    return null;
  }

  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    return null;
  }

  return cached.models;
}

export async function setCachedModels(
  provider: OAuthProviderType,
  models: OAuthModelInfo[],
): Promise<void> {
  const state = getGlobalState();
  await state.update(getCacheKey(provider), {
    models,
    timestamp: Date.now(),
  });
}

export async function clearModelCache(
  provider?: OAuthProviderType,
): Promise<void> {
  const state = getGlobalState();
  if (provider) {
    await state.update(getCacheKey(provider), undefined);
  } else {
    for (const p of ALL_OAUTH_PROVIDERS) {
      await state.update(getCacheKey(p), undefined);
    }
  }
}

// Standard Gemini models (for direct Google OAuth)
export const GEMINI_MODELS: OAuthModelInfo[] = [
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    supportsTools: true,
    supportsVision: true,
  },
];

// Antigravity-specific Gemini models (use different naming convention)
export const ANTIGRAVITY_GEMINI_MODELS: OAuthModelInfo[] = [
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "gemini-3-pro-low",
    name: "Gemini 3 Pro (Low)",
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "gemini-3-pro-high",
    name: "Gemini 3 Pro (High)",
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    supportsTools: true,
    supportsVision: true,
  },
];

// Standard Claude models (for direct Anthropic OAuth)
export const CLAUDE_MODELS: OAuthModelInfo[] = [
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "claude-opus-4-20250514",
    name: "Claude Opus 4",
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "claude-3-7-sonnet-20250219",
    name: "Claude 3.7 Sonnet",
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    supportsTools: true,
    supportsVision: true,
  },
];

// Antigravity-specific Claude models (use different naming convention)
export const ANTIGRAVITY_CLAUDE_MODELS: OAuthModelInfo[] = [
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "claude-sonnet-4-5-thinking-low",
    name: "Claude Sonnet 4.5 (Thinking Low)",
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "claude-sonnet-4-5-thinking-medium",
    name: "Claude Sonnet 4.5 (Thinking Medium)",
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "claude-sonnet-4-5-thinking-high",
    name: "Claude Sonnet 4.5 (Thinking High)",
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "claude-opus-4-5",
    name: "Claude Opus 4.5",
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "claude-opus-4-5-thinking-low",
    name: "Claude Opus 4.5 (Thinking Low)",
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "claude-opus-4-5-thinking-medium",
    name: "Claude Opus 4.5 (Thinking Medium)",
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: "claude-opus-4-5-thinking-high",
    name: "Claude Opus 4.5 (Thinking High)",
    supportsTools: true,
    supportsVision: true,
  },
];

export const CHATGPT_MODELS: OAuthModelInfo[] = [
  { id: "gpt-5.2-codex", name: "GPT-5.2 Codex", supportsTools: true },
  { id: "gpt-5.1-codex", name: "GPT-5.1 Codex", supportsTools: true },
  { id: "gpt-5.0-codex", name: "GPT-5.0 Codex", supportsTools: true },
  { id: "o3", name: "o3", supportsTools: true },
  { id: "o3-mini", name: "o3-mini", supportsTools: true },
  { id: "o4-mini", name: "o4-mini", supportsTools: true },
];

// Antigravity models combine Gemini and Claude via Google OAuth
// Users select models with "antigravity/" prefix, e.g., "antigravity/gemini-3-flash"
export const ANTIGRAVITY_MODELS: OAuthModelInfo[] = [
  // Gemini models via Antigravity (no suffix - the antigravity/ prefix identifies the provider)
  ...ANTIGRAVITY_GEMINI_MODELS.map((m) => ({
    ...m,
    name: `${m.name} (Antigravity)`,
  })),
  // Claude models via Antigravity
  ...ANTIGRAVITY_CLAUDE_MODELS.map((m) => ({
    ...m,
    name: `${m.name} (via Antigravity)`,
  })),
];

export function getDefaultModels(
  provider: OAuthProviderType,
): OAuthModelInfo[] {
  switch (provider) {
    case "gemini":
      return GEMINI_MODELS;
    case "claude":
      return CLAUDE_MODELS;
    case "chatgpt":
      return CHATGPT_MODELS;
    case "antigravity":
      return ANTIGRAVITY_MODELS;
    default:
      return [];
  }
}

export async function getModels(
  provider: OAuthProviderType,
): Promise<OAuthModelInfo[]> {
  const cached = await getCachedModels(provider);
  if (cached) {
    return cached;
  }

  // For Antigravity, try to fetch from API
  if (provider === "antigravity") {
    try {
      const token = await getValidToken("antigravity");
      if (token?.accessToken && token.projectId) {
        const models = await fetchAvailableModels(
          token.accessToken,
          token.projectId,
        );
        if (models.length > 0) {
          await setCachedModels(provider, models);
          return models;
        }
      }
    } catch (error) {
      console.error("Failed to fetch Antigravity models:", error);
    }
  }

  return getDefaultModels(provider);
}

/**
 * Force refresh models from API (bypasses cache).
 * Useful when user wants to see latest quota info.
 */
export async function refreshAntigravityModels(): Promise<OAuthModelInfo[]> {
  try {
    const token = await getValidToken("antigravity");
    if (!token?.accessToken || !token.projectId) {
      return getDefaultModels("antigravity");
    }

    const models = await fetchAvailableModels(
      token.accessToken,
      token.projectId,
    );
    if (models.length > 0) {
      await setCachedModels("antigravity", models);
      return models;
    }
  } catch (error) {
    console.error("Failed to refresh Antigravity models:", error);
  }

  return getDefaultModels("antigravity");
}

/**
 * Format model name with quota info for display.
 * Example: "Gemini 3 Flash [████████░░] 80%"
 */
export function formatModelWithQuota(model: OAuthModelInfo): string {
  if (!model.quotaInfo) {
    return model.name;
  }

  const fraction = model.quotaInfo.remainingFraction;
  const percent = Math.round(fraction * 100);
  const filled = Math.round(percent / 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);

  return `${model.name} [${bar}] ${percent}%`;
}

export function getPrefixedModelId(
  provider: OAuthProviderType,
  modelId: string,
): string {
  return `${OAUTH_MODEL_PREFIXES[provider]}${modelId}`;
}

/**
 * Check if a model ID is an Antigravity-specific model (without prefix).
 * Antigravity models have unique names not used by other providers:
 * - Gemini 3 series: gemini-3-flash, gemini-3-pro-low, gemini-3-pro-high
 * - Claude 4.5 series: claude-sonnet-4-5*, claude-opus-4-5*
 */
export function isAntigravityModel(modelId: string): boolean {
  const antigravityPatterns = [
    /^gemini-3-/, // Gemini 3 series (Antigravity-specific)
    /^claude-sonnet-4-5/, // Claude Sonnet 4.5 (Antigravity naming)
    /^claude-opus-4-5/, // Claude Opus 4.5 (Antigravity naming)
  ];
  return antigravityPatterns.some((pattern) => pattern.test(modelId));
}

export function parseModelId(
  prefixedModelId: string,
): { provider: OAuthProviderType; modelId: string } | null {
  // First check for explicit prefixes
  for (const [provider, prefix] of Object.entries(OAUTH_MODEL_PREFIXES)) {
    if (prefixedModelId.startsWith(prefix)) {
      return {
        provider: provider as OAuthProviderType,
        modelId: prefixedModelId.slice(prefix.length),
      };
    }
  }

  // Auto-detect Antigravity models by their unique names (no prefix required)
  if (isAntigravityModel(prefixedModelId)) {
    return {
      provider: "antigravity",
      modelId: prefixedModelId,
    };
  }

  return null;
}

export function isOAuthModel(modelId: string): boolean {
  return parseModelId(modelId) !== null;
}
