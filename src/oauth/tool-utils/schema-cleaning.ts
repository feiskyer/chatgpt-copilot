const UNSUPPORTED_KEYWORDS = [
  "$schema",
  "$defs",
  "definitions",
  "const",
  "$ref",
  "additionalProperties",
  "propertyNames",
  "title",
  "$id",
  "$comment",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "default",
  "examples",
  "minItems",
  "maxItems",
  "exclusiveMinimum",
  "exclusiveMaximum",
];

const EMPTY_SCHEMA_PLACEHOLDER = {
  _placeholder: {
    type: "boolean",
    description: "Placeholder. Always pass true.",
  },
};

type SchemaObject = Record<string, unknown>;

function isObject(value: unknown): value is SchemaObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const CONSTRAINT_FORMATTERS: Array<{
  key: string;
  type: "string" | "number";
  format: (value: string | number) => string;
}> = [
  { key: "minLength", type: "number", format: (v) => `minLength: ${v}` },
  { key: "maxLength", type: "number", format: (v) => `maxLength: ${v}` },
  { key: "pattern", type: "string", format: (v) => `pattern: ${v}` },
  { key: "format", type: "string", format: (v) => `format: ${v}` },
  { key: "minItems", type: "number", format: (v) => `minItems: ${v}` },
  { key: "maxItems", type: "number", format: (v) => `maxItems: ${v}` },
  { key: "exclusiveMinimum", type: "number", format: (v) => `> ${v}` },
  { key: "exclusiveMaximum", type: "number", format: (v) => `< ${v}` },
];

function collectConstraintHints(schema: SchemaObject): string[] {
  const hints: string[] = [];
  for (const { key, type, format } of CONSTRAINT_FORMATTERS) {
    const value = schema[key];
    if (typeof value === type) {
      hints.push(format(value as string | number));
    }
  }
  return hints;
}

function resolveRef(
  ref: string,
  rootSchema: SchemaObject,
): SchemaObject | null {
  if (!ref.startsWith("#/")) {
    return null;
  }

  const path = ref.slice(2).split("/");
  let current: unknown = rootSchema;

  for (const segment of path) {
    if (!isObject(current)) {
      return null;
    }
    current = current[segment];
  }

  return isObject(current) ? current : null;
}

function mergeAllOf(allOfSchemas: SchemaObject[]): SchemaObject {
  const merged: SchemaObject = { type: "object" };
  const properties: SchemaObject = {};
  const required: string[] = [];

  for (const schema of allOfSchemas) {
    if (isObject(schema.properties)) {
      Object.assign(properties, schema.properties);
    }
    if (Array.isArray(schema.required)) {
      required.push(
        ...schema.required.filter((r): r is string => typeof r === "string"),
      );
    }
    if (schema.type) {
      merged.type = schema.type;
    }
    if (schema.description) {
      merged.description = schema.description;
    }
  }

  if (Object.keys(properties).length > 0) {
    merged.properties = properties;
  }
  if (required.length > 0) {
    merged.required = [...new Set(required)];
  }

  return merged;
}

function cleanSchemaRecursive(
  schema: unknown,
  rootSchema: SchemaObject,
  visited: Set<unknown> = new Set(),
): unknown {
  if (!isObject(schema)) {
    return schema;
  }

  if (visited.has(schema)) {
    return { type: "object" };
  }
  visited.add(schema);

  const cleaned: SchemaObject = {};

  if (schema.$ref && typeof schema.$ref === "string") {
    const resolved = resolveRef(schema.$ref, rootSchema);
    if (resolved) {
      const cleanedResolved = cleanSchemaRecursive(
        resolved,
        rootSchema,
        visited,
      );
      if (isObject(cleanedResolved)) {
        Object.assign(cleaned, cleanedResolved);
      }
    } else {
      const refName = schema.$ref.split("/").pop() || "Reference";
      cleaned.description = `See: ${refName}`;
      cleaned.type = "object";
    }
  }

  if (Array.isArray(schema.allOf)) {
    const resolvedSchemas = schema.allOf
      .map((s) => cleanSchemaRecursive(s, rootSchema, visited))
      .filter(isObject);
    const merged = mergeAllOf(resolvedSchemas);
    Object.assign(cleaned, merged);
  }

  if (schema.const !== undefined) {
    cleaned.enum = [schema.const];
  }

  const constraintHints = collectConstraintHints(schema);
  if (constraintHints.length > 0) {
    const existingDesc =
      typeof schema.description === "string" ? schema.description : "";
    cleaned.description = existingDesc
      ? `${existingDesc} (${constraintHints.join(", ")})`
      : constraintHints.join(", ");
  } else if (schema.description) {
    cleaned.description = schema.description;
  }

  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED_KEYWORDS.includes(key)) {
      continue;
    }

    if (key in cleaned) {
      continue;
    }

    if (key === "properties" && isObject(value)) {
      const cleanedProps: SchemaObject = {};
      for (const [propKey, propValue] of Object.entries(value)) {
        cleanedProps[propKey] = cleanSchemaRecursive(
          propValue,
          rootSchema,
          visited,
        );
      }
      cleaned.properties = cleanedProps;
    } else if (key === "items") {
      cleaned.items = cleanSchemaRecursive(value, rootSchema, visited);
    } else if (key === "anyOf" || key === "oneOf") {
      const cleanedOptions = (value as unknown[]).map((opt) =>
        cleanSchemaRecursive(opt, rootSchema, visited),
      );
      cleaned[key] = cleanedOptions;
    } else {
      cleaned[key] = value;
    }
  }

  if (cleaned.type === "object") {
    if (
      !cleaned.properties ||
      Object.keys(cleaned.properties as SchemaObject).length === 0
    ) {
      cleaned.properties = EMPTY_SCHEMA_PLACEHOLDER;
    }
  }

  return cleaned;
}

export function cleanJSONSchemaForProviders(schema: unknown): unknown {
  if (!isObject(schema)) {
    return schema;
  }

  return cleanSchemaRecursive(schema, schema);
}

export interface Tool {
  name: string;
  description?: string;
  parameters?: unknown;
  inputSchema?: unknown;
  function?: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
  [key: string]: unknown;
}

export function cleanToolSchemas(tools: unknown[]): Tool[] {
  const toolArray = tools as Tool[];
  return toolArray.map((tool) => {
    const cleaned = { ...tool };

    if (tool.parameters) {
      cleaned.parameters = cleanJSONSchemaForProviders(tool.parameters);
    }

    if (tool.inputSchema) {
      cleaned.inputSchema = cleanJSONSchemaForProviders(tool.inputSchema);
    }

    if (tool.function?.parameters) {
      cleaned.function = {
        ...tool.function,
        parameters: cleanJSONSchemaForProviders(tool.function.parameters),
      };
    }

    return cleaned;
  });
}

export function isEmptySchema(schema: unknown): boolean {
  if (!isObject(schema)) {
    return false;
  }

  if (schema.type !== "object") {
    return false;
  }

  const props = schema.properties;
  if (!props || !isObject(props)) {
    return true;
  }

  return Object.keys(props).length === 0;
}
