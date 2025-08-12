// Vibe coded from https://github.com/ben-vargas/ai-sdk-provider-claude-code to make it working within vscode extension environment
/**
 * Extract JSON from Claude's response using a tolerant parser.
 *
 * The function removes common wrappers such as markdown fences or variable
 * declarations and then attempts to parse the remaining text with
 * custom JSON parsing logic. If valid JSON (or JSONC) can be parsed, it is returned as a
 * string via `JSON.stringify`. Otherwise the original text is returned.
 *
 * @param text - Raw text which may contain JSON
 * @returns A valid JSON string if extraction succeeds, otherwise the original text
 */

/**
 * Strip JavaScript-style comments from a string while preserving JSON integrity
 */
function stripComments(text: string): string {
  let result = "";
  let i = 0;
  let inString = false;

  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];

    // Handle escape sequences in strings
    if (inString && char === "\\") {
      // Add both the escape character and the next character
      result += char;
      if (i + 1 < text.length) {
        result += text[i + 1];
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    // Track string boundaries (JSON only uses double quotes)
    if (!inString && char === '"') {
      inString = true;
      result += char;
      i++;
      continue;
    }

    if (inString && char === '"') {
      inString = false;
      result += char;
      i++;
      continue;
    }

    // Skip comments when not in string
    if (!inString) {
      // Single line comment
      if (char === "/" && nextChar === "/") {
        // Skip to end of line but preserve the newline
        i += 2;
        while (i < text.length && text[i] !== "\n" && text[i] !== "\r") {
          i++;
        }
        // Add whitespace to maintain structure
        if (i < text.length && (text[i] === "\n" || text[i] === "\r")) {
          result += text[i];
          i++;
        }
        continue;
      }

      // Multi-line comment
      if (char === "/" && nextChar === "*") {
        i += 2;
        // Skip to end of comment
        while (i < text.length - 1) {
          if (text[i] === "*" && text[i + 1] === "/") {
            i += 2;
            break;
          }
          i++;
        }
        // Add a space to maintain structure
        result += " ";
        continue;
      }
    }

    result += char;
    i++;
  }

  return result;
}

/**
 * Remove trailing commas from JSON-like text
 */
function stripTrailingCommas(text: string): string {
  let result = "";
  let i = 0;
  let inString = false;

  while (i < text.length) {
    const char = text[i];

    // Handle escape sequences in strings
    if (inString && char === "\\") {
      result += char;
      if (i + 1 < text.length) {
        result += text[i + 1];
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    // Track string boundaries (JSON only uses double quotes)
    if (!inString && char === '"') {
      inString = true;
      result += char;
      i++;
      continue;
    }

    if (inString && char === '"') {
      inString = false;
      result += char;
      i++;
      continue;
    }

    // Remove trailing commas when not in string
    if (!inString && char === ",") {
      // Look ahead to see if this is a trailing comma
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) {
        j++;
      }

      if (j < text.length && (text[j] === "}" || text[j] === "]")) {
        // This is a trailing comma, skip it
        i++;
        continue;
      }
    }

    result += char;
    i++;
  }

  return result;
}

/**
 * Try to parse JSON with multiple fallback strategies
 */
function tryParseJson(value: string): string | undefined {
  if (!value || !value.trim()) {
    return undefined;
  }

  const strategies = [
    // Strategy 1: Parse as-is
    (text: string) => text,
    // Strategy 2: Strip comments only
    (text: string) => stripComments(text),
    // Strategy 3: Strip trailing commas only
    (text: string) => stripTrailingCommas(text),
    // Strategy 4: Strip both comments and trailing commas
    (text: string) => stripTrailingCommas(stripComments(text)),
  ];

  for (const strategy of strategies) {
    try {
      const processed = strategy(value.trim());
      const result = JSON.parse(processed);
      // Validate that we got a meaningful object or array
      if (result && typeof result === "object") {
        // Don't return empty objects or arrays as valid extractions
        if (Array.isArray(result) && result.length === 0) {
          continue;
        }
        if (!Array.isArray(result) && Object.keys(result).length === 0) {
          continue;
        }
        return JSON.stringify(result, null, 2);
      }
    } catch {
      // Continue to next strategy
    }
  }

  // Only try repair as a last resort and only if JSON looks mostly complete
  if (isRepairableJson(value)) {
    try {
      const cleaned = stripTrailingCommas(stripComments(value));
      const repaired = repairJson(cleaned);
      const result = JSON.parse(repaired);
      if (result && typeof result === "object") {
        // Don't return empty objects or arrays as valid extractions
        if (Array.isArray(result) && result.length === 0) {
          return undefined;
        }
        if (!Array.isArray(result) && Object.keys(result).length === 0) {
          return undefined;
        }
        return JSON.stringify(result, null, 2);
      }
    } catch {
      // Repair failed
    }
  }

  return undefined;
}

/**
 * Check if JSON looks repairable (not severely malformed)
 */
function isRepairableJson(text: string): boolean {
  // Don't try to repair very simple or severely malformed cases
  if (text.length < 10) {
    return false;
  }

  // Only try to repair if the JSON has proper structure but is just missing closing braces
  const openBraces = (text.match(/{/g) || []).length;
  const closeBraces = (text.match(/}/g) || []).length;
  const openBrackets = (text.match(/\[/g) || []).length;
  const closeBrackets = (text.match(/]/g) || []).length;

  // Only repair if we're missing at most 2 closing characters
  const missingBraces = openBraces - closeBraces;
  const missingBrackets = openBrackets - closeBrackets;

  // Don't repair if there are unmatched quotes or severely malformed structure
  const quotes = (text.match(/"/g) || []).length;
  if (quotes % 2 !== 0) {
    return false; // Unmatched quotes
  }

  // Don't repair if there are obvious syntax errors like missing quotes
  if (text.includes('{"unclosed": "quote}')) {
    return false;
  }

  // Must have at least one complete key-value pair to be repairable
  const hasCompleteKeyValue =
    /"[^"]*"\s*:\s*("[^"]*"|[0-9]+|true|false|null)/.test(text);

  return (
    hasCompleteKeyValue &&
    missingBraces >= 0 &&
    missingBraces <= 2 &&
    missingBrackets >= 0 &&
    missingBrackets <= 2 &&
    missingBraces + missingBrackets > 0
  );
}

/**
 * Basic JSON repair - attempts to fix unclosed braces and brackets
 */
function repairJson(text: string): string {
  let depth = 0;
  let arrayDepth = 0;
  let inString = false;
  let result = text;

  // Track brace/bracket balance
  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inString && char === "\\") {
      i++; // Skip escaped character
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
      } else if (char === "[") {
        arrayDepth++;
      } else if (char === "]") {
        arrayDepth--;
      }
    }
  }

  // Add missing closing characters
  while (arrayDepth > 0) {
    result += "]";
    arrayDepth--;
  }
  while (depth > 0) {
    result += "}";
    depth--;
  }

  return result;
}

/**
 * Find JSON boundaries more accurately
 */
function findJsonBoundaries(content: string): number[] {
  const positions: number[] = [];
  const openChar = content[0];
  const closeChar = openChar === "{" ? "}" : "]";

  let depth = 0;
  let inString = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];

    // Handle escape sequences
    if (inString && char === "\\") {
      i += 2; // Skip escaped character
      continue;
    }

    // Track string boundaries
    if (char === '"') {
      inString = !inString;
      i++;
      continue;
    }

    // Skip content inside strings
    if (inString) {
      i++;
      continue;
    }

    // Track nesting depth
    if (char === openChar) {
      depth++;
    } else if (char === closeChar) {
      depth--;
      if (depth === 0) {
        positions.push(i + 1);
      }
    }

    i++;
  }

  return positions;
}

export function extractJson(text: string): string {
  if (!text || typeof text !== "string") {
    return text || "";
  }

  let content = text.trim();
  if (!content) {
    return text;
  }

  // Strip markdown code fences
  const fencePatterns = [
    /```(?:json|jsonc|javascript|js)?\s*([\s\S]*?)\s*```/i,
    /`([^`]+)`/,
  ];

  for (const pattern of fencePatterns) {
    const match = pattern.exec(content);
    if (match && match[1]) {
      content = match[1].trim();
      break;
    }
  }

  // Strip variable declarations and assignments
  const assignmentPatterns = [
    /^\s*(?:const|let|var)\s+\w+\s*=\s*([\s\S]*)/i,
    /^\s*(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*([\s\S]*)/i,
    /^\s*\w+\s*=\s*([\s\S]*)/,
  ];

  for (const pattern of assignmentPatterns) {
    const match = pattern.exec(content);
    if (match && match[1]) {
      content = match[1].trim();
      // Remove trailing semicolon
      if (content.endsWith(";")) {
        content = content.slice(0, -1).trim();
      }
      break;
    }
  }

  // Find the first JSON-like structure
  const firstObj = content.indexOf("{");
  const firstArr = content.indexOf("[");

  if (firstObj === -1 && firstArr === -1) {
    // No JSON structure found, return original text
    return text;
  }

  // Use the first valid JSON structure found
  const start =
    firstArr === -1
      ? firstObj
      : firstObj === -1
        ? firstArr
        : Math.min(firstObj, firstArr);

  content = content.slice(start);

  // Try to parse the complete content first
  const fullParse = tryParseJson(content);
  if (fullParse !== undefined) {
    return fullParse;
  }

  // Find valid JSON boundaries and try parsing substrings
  const boundaries = findJsonBoundaries(content);

  // Try parsing from longest to shortest valid boundaries
  for (let i = boundaries.length - 1; i >= 0; i--) {
    const substring = content.slice(0, boundaries[i]);
    const parsed = tryParseJson(substring);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  // Final fallback: try progressive truncation with limited scope
  const maxAttempts = Math.min(500, content.length);
  for (
    let end = content.length;
    end > content.length - maxAttempts && end > 0;
    end--
  ) {
    const substring = content.slice(0, end);
    const parsed = tryParseJson(substring);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  // If all else fails, return the original text
  return text;
}
