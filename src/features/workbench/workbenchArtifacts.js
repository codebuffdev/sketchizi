/**
 * Deterministic, reviewable Workbench artifact generators.
 * These functions consume the canonical semantic model and have no UI or I/O dependency.
 * Generated artifacts are previews; they do not deploy anything or mutate the model.
 */

const HTTP_METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const POSTGRES_TYPES = new Set([
  "SMALLINT", "INTEGER", "INT", "BIGINT", "SERIAL", "BIGSERIAL", "REAL", "DOUBLE PRECISION",
  "BOOLEAN", "TEXT", "UUID", "DATE", "TIME", "TIMESTAMP", "TIMESTAMPTZ", "JSON", "JSONB", "BYTEA",
]);

function objectLike(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function error(code, message, entityIds = []) {
  return { code, message, severity: "error", entityIds };
}

function warning(code, message, entityIds = []) {
  return { code, message, severity: "warning", entityIds };
}

function result({ kind, filename, mimeType, value, errors = [], warnings = [], modelRevision = 0 }) {
  const ok = errors.length === 0;
  return {
    kind,
    filename,
    mimeType,
    ok,
    modelRevision: Number.isSafeInteger(modelRevision) ? modelRevision : 0,
    errors,
    warnings,
    text: ok ? (typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`) : "",
    value: ok ? value : null,
  };
}

function validateSchemaNode(schema, label, entityId, errors, depth = 0) {
  if (!objectLike(schema)) {
    errors.push(error("openapi.invalid-schema-shape", `${label} must be a JSON Schema object.`, [entityId]));
    return;
  }
  if (depth > 32) {
    errors.push(error("openapi.schema-too-deep", `${label} exceeds the supported nesting depth of 32.`, [entityId]));
    return;
  }
  const types = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);
  const validType = (type) => typeof type === "string" && types.has(type);
  if (schema.type != null && !(validType(schema.type) || (Array.isArray(schema.type) && schema.type.length > 0 && schema.type.every(validType)))) {
    errors.push(error("openapi.invalid-schema-type", `${label} uses an unsupported JSON Schema type.`, [entityId]));
  }
  if (schema.$ref != null) {
    errors.push(error("openapi.schema-ref-unsupported", `${label} uses $ref, but this initial generator only supports inline schemas so references cannot be emitted unresolved.`, [entityId]));
  }
  if (schema.properties != null) {
    if (!objectLike(schema.properties)) {
      errors.push(error("openapi.invalid-schema-properties", `${label}.properties must be an object.`, [entityId]));
    } else {
      for (const [propertyName, propertySchema] of Object.entries(schema.properties)) {
        validateSchemaNode(propertySchema, `${label}.properties.${propertyName}`, entityId, errors, depth + 1);
      }
    }
  }
  if (schema.items != null) validateSchemaNode(schema.items, `${label}.items`, entityId, errors, depth + 1);
  if (schema.required != null && (!Array.isArray(schema.required) || !schema.required.every((item) => typeof item === "string"))) {
    errors.push(error("openapi.invalid-schema-required", `${label}.required must be an array of property names.`, [entityId]));
  }
  if (schema.enum != null && !Array.isArray(schema.enum)) {
    errors.push(error("openapi.invalid-schema-enum", `${label}.enum must be an array.`, [entityId]));
  }
}

function readSchema(raw, label, entityId, errors) {
  if (raw == null || String(raw).trim() === "") return null;
  let schema;
  try {
    schema = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    errors.push(error("openapi.invalid-schema-json", `${label} must contain valid JSON.`, [entityId]));
    return null;
  }
  const initialErrorCount = errors.length;
  validateSchemaNode(schema, label, entityId, errors);
  return errors.length === initialErrorCount ? structuredClone(schema) : null;
}

function operationPath(rawPath, entityId, errors) {
  const path = String(rawPath || "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\s]/.test(path)) {
    errors.push(error("openapi.invalid-path", `Endpoint path '${path || "(empty)"}' must start with '/' and cannot contain a query, fragment, or whitespace.`, [entityId]));
    return null;
  }
  const openBraces = (path.match(/{/g) || []).length;
  const closeBraces = (path.match(/}/g) || []).length;
  if (openBraces !== closeBraces || /{[^{}]*}/.test(path) === false && openBraces > 0) {
    errors.push(error("openapi.invalid-path-parameter", `Endpoint path '${path}' has a malformed path parameter. Use {parameterName}.`, [entityId]));
    return null;
  }
  const params = [...path.matchAll(/{([^{}]+)}/g)].map((match) => match[1]);
  if (params.some((name) => !IDENTIFIER.test(name)) || new Set(params).size !== params.length) {
    errors.push(error("openapi.invalid-path-parameter", `Endpoint path '${path}' contains an invalid or duplicated path parameter name.`, [entityId]));
    return null;
  }
  return { path, params };
}

/** Explain the exact component scope before generating a service-specific artifact. */
export function analyzeWorkbenchArtifactScope(workbench, serviceId = "") {
  const entities = Array.isArray(workbench?.entities) ? workbench.entities : [];
  const relations = Array.isArray(workbench?.relations) ? workbench.relations : [];
  if (!serviceId) {
    return {
      service: null,
      scoped: false,
      includedEntities: entities,
      excludedEntities: [],
      includedRelations: relations,
      warnings: [],
    };
  }
  const service = entities.find((entity) => entity?.id === serviceId && ["backend.rest-service", "backend.worker", "frontend.react-app"].includes(entity.kind));
  if (!service) {
    return {
      service: null, scoped: true, includedEntities: [], excludedEntities: entities,
      includedRelations: [], warnings: [{ code: "scope.unknown-service", severity: "error", message: "The selected HLD scope no longer exists. Choose a valid service before generating artifacts." }],
    };
  }
  const included = new Set([service.id]);
  for (const entity of entities) if (entity?.properties?.implementationParentId === service.id) included.add(entity.id);
  for (const relation of relations) if (relation?.kind === "exposes" && relation.sourceId === service.id) included.add(relation.targetId);
  for (const relation of relations) if (relation?.kind === "contains-table" && included.has(relation.targetId)) included.add(relation.sourceId);
  const includedEntities = entities.filter((entity) => included.has(entity.id));
  const includedIds = new Set(includedEntities.map((entity) => entity.id));
  const includedRelations = relations.filter((relation) => includedIds.has(relation.sourceId) && includedIds.has(relation.targetId));
  const unassigned = entities.filter((entity) => WORKBENCH_LLD_KINDS.has(entity.kind) && !entity.properties?.implementationParentId);
  const ownedTables = includedEntities.filter((entity) => entity.kind === "data.postgresql-table");
  const endpoints = includedEntities.filter((entity) => entity.kind === "backend.api-endpoint");
  const warnings = [];
  if (unassigned.length) warnings.push({ code: "scope.unassigned-implementation", severity: "warning", entityIds: unassigned.map((entity) => entity.id), message: `${unassigned.length} low-level component(s) have no parent HLD assignment and are excluded from this service scope.` });
  if (service.kind === "backend.rest-service" && endpoints.length === 0) warnings.push({ code: "scope.no-api-endpoints", severity: "warning", entityIds: [service.id], message: "This REST service has no included API endpoints. OpenAPI generation will need endpoint components exposed by this service." });
  if (ownedTables.length === 0) warnings.push({ code: "scope.no-tables", severity: "warning", entityIds: [service.id], message: "No PostgreSQL tables are included in this scope. SQL generation may not produce a useful schema." });
  return {
    service, scoped: true, includedEntities,
    excludedEntities: entities.filter((entity) => !includedIds.has(entity.id)),
    includedRelations, warnings,
  };
}

const WORKBENCH_LLD_KINDS = new Set([
  "backend.api-endpoint", "backend.rest-controller", "backend.java-interface", "backend.java-class",
  "backend.repository", "data.postgresql-table", "design.domain-entity",
]);

/** Restrict artifact generation to one HLD service and its explicitly owned or exposed elements. */
export function scopeWorkbenchToService(workbench, serviceId) {
  const entities = Array.isArray(workbench?.entities) ? workbench.entities : [];
  const relations = Array.isArray(workbench?.relations) ? workbench.relations : [];
  const service = entities.find((entity) => entity?.id === serviceId && ["backend.rest-service", "backend.worker", "frontend.react-app"].includes(entity.kind));
  if (!service) return { ...workbench, entities: [], relations: [], artifactScope: { serviceId: "", serviceName: "" } };
  const included = new Set([service.id]);
  for (const entity of entities) {
    if (entity?.properties?.implementationParentId === service.id) included.add(entity.id);
  }
  for (const relation of relations) {
    if (relation?.kind === "exposes" && relation.sourceId === service.id) included.add(relation.targetId);
  }
  // Include only databases that contain an explicitly owned table; keep relation endpoints closed.
  for (const relation of relations) {
    if (relation?.kind === "contains-table" && included.has(relation.targetId)) included.add(relation.sourceId);
  }
  const scopedEntities = entities.filter((entity) => included.has(entity.id));
  const ids = new Set(scopedEntities.map((entity) => entity.id));
  return {
    ...workbench,
    entities: scopedEntities,
    relations: relations.filter((relation) => ids.has(relation.sourceId) && ids.has(relation.targetId)),
    artifactScope: { serviceId: service.id, serviceName: service.name || service.id },
  };
}

/** Build an OpenAPI 3.1 document from endpoints with exactly one exposing REST service. */
export function generateOpenApiArtifact(workbench) {
  const entities = Array.isArray(workbench?.entities) ? workbench.entities : [];
  const relations = Array.isArray(workbench?.relations) ? workbench.relations : [];
  const errors = [];
  const warnings = [];
  const endpoints = entities.filter((entity) => entity?.kind === "backend.api-endpoint");
  const services = new Map(entities.filter((entity) => entity?.kind === "backend.rest-service").map((entity) => [entity.id, entity]));

  if (endpoints.length === 0) {
    errors.push(error("openapi.no-endpoints", "Add at least one API endpoint component, configure its method and path, and connect it to a REST service with an Exposes API relationship."));
  }

  const paths = {};
  const operationIds = new Map();
  const ownersSeen = new Set();
  for (const endpoint of endpoints) {
    const owningRelations = relations.filter((relation) => relation?.kind === "exposes" && relation.targetId === endpoint.id && services.has(relation.sourceId));
    if (owningRelations.length !== 1) {
      const detail = owningRelations.length === 0
        ? "Connect exactly one REST service to this endpoint with an Exposes API relationship."
        : "This endpoint is exposed by multiple REST services; choose one owner before generating a single OpenAPI document.";
      errors.push(error("openapi.endpoint-owner-count", `${endpoint.name || endpoint.id}: ${detail}`, [endpoint.id, ...owningRelations.map((relation) => relation.sourceId)]));
      continue;
    }

    const service = services.get(owningRelations[0].sourceId);
    ownersSeen.add(service.id);
    const props = endpoint.properties || {};
    const method = String(props.method || "GET").toLowerCase();
    if (!HTTP_METHODS.has(method)) {
      errors.push(error("openapi.invalid-method", `${endpoint.name || endpoint.id} uses unsupported HTTP method '${props.method}'.`, [endpoint.id]));
      continue;
    }
    const parsedPath = operationPath(props.path, endpoint.id, errors);
    const operationId = String(props.operationId || "").trim();
    if (!/^[A-Za-z_][A-Za-z0-9._-]*$/.test(operationId)) {
      errors.push(error("openapi.invalid-operation-id", `${endpoint.name || endpoint.id} needs a valid operationId (letters, digits, '.', '_' or '-'; it must not start with a digit).`, [endpoint.id]));
      continue;
    }
    if (operationIds.has(operationId)) {
      errors.push(error("openapi.duplicate-operation-id", `operationId '${operationId}' is used by both ${operationIds.get(operationId)} and ${endpoint.id}.`, [operationIds.get(operationId), endpoint.id]));
      continue;
    }
    operationIds.set(operationId, endpoint.id);
    if (!parsedPath) continue;
    if (paths[parsedPath.path]?.[method]) {
      const existing = paths[parsedPath.path][method].operationId;
      errors.push(error("openapi.duplicate-route", `${method.toUpperCase()} ${parsedPath.path} is defined more than once (including operation '${existing}').`, [endpoint.id]));
      continue;
    }
    const requestSchema = readSchema(props.requestSchema, `${endpoint.name || endpoint.id} requestSchema`, endpoint.id, errors);
    const responseSchema = readSchema(props.responseSchema, `${endpoint.name || endpoint.id} responseSchema`, endpoint.id, errors);
    const parameters = parsedPath.params.map((name) => ({ name, in: "path", required: true, schema: { type: "string" } }));
    const operation = {
      operationId,
      summary: String(props.summary || endpoint.name || operationId).trim(),
      tags: [String(service.name || "REST service")],
      ...(parameters.length ? { parameters } : {}),
      ...(requestSchema ? { requestBody: { required: true, content: { "application/json": { schema: requestSchema } } } } : {}),
      responses: {
        "200": {
          description: "Successful response",
          ...(responseSchema ? { content: { "application/json": { schema: responseSchema } } } : {}),
        },
      },
    };
    paths[parsedPath.path] ||= {};
    paths[parsedPath.path][method] = operation;
  }

  for (const serviceId of ownersSeen) {
    const service = services.get(serviceId);
    if (!String(service?.properties?.basePath || "").startsWith("/")) {
      warnings.push(warning("openapi.service-base-path", `REST service '${service?.name || serviceId}' has no absolute basePath; generated paths are used as written.`, [serviceId]));
    }
  }

  const ownedServices = [...ownersSeen].map((id) => services.get(id)).filter(Boolean);
  const serviceNames = [...new Set(ownedServices.map((service) => service.name).filter(Boolean))];
  const infoTitle = serviceNames.length === 1 ? `${serviceNames[0]} API` : "Sketchizi API";
  const infoVersion = ownedServices.length === 1 && String(ownedServices[0]?.properties?.apiVersion || "").trim()
    ? String(ownedServices[0].properties.apiVersion).trim() : "1.0.0";
  const spec = {
    openapi: "3.1.0",
    info: { title: infoTitle, version: infoVersion, description: "Generated from the Sketchizi Engineering Workbench semantic model." },
    paths,
    "x-sketchizi-model-revision": Number.isSafeInteger(workbench?.modelRevision) ? workbench.modelRevision : 0,
    ...(workbench?.artifactScope?.serviceId ? { "x-sketchizi-artifact-scope": { serviceId: workbench.artifactScope.serviceId, serviceName: workbench.artifactScope.serviceName } } : {}),
  };
  const scopedSlug = String(workbench?.artifactScope?.serviceName || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return result({ kind: "openapi", filename: scopedSlug ? `openapi-${scopedSlug}.json` : "openapi.json", mimeType: "application/json;charset=utf-8", value: spec, errors, warnings, modelRevision: workbench?.modelRevision });
}

function parseColumns(table, errors) {
  const raw = table?.properties?.columns;
  let columns;
  try {
    columns = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    errors.push(error("sql.invalid-columns-json", `Table '${table?.name || table?.id}' has invalid JSON in its columns field.`, [table?.id].filter(Boolean)));
    return null;
  }
  if (!Array.isArray(columns) || columns.length === 0) {
    errors.push(error("sql.columns-required", `Table '${table?.name || table?.id}' needs a non-empty columns array.`, [table?.id].filter(Boolean)));
    return null;
  }
  const names = new Set();
  const primaryKeys = [];
  for (const column of columns) {
    if (!objectLike(column)) {
      errors.push(error("sql.invalid-column", `Table '${table?.name || table?.id}' contains a column that is not an object.`, [table?.id].filter(Boolean)));
      continue;
    }
    if (typeof column.name !== "string" || !IDENTIFIER.test(column.name)) {
      errors.push(error("sql.invalid-column-name", `Table '${table?.name || table?.id}' has an invalid column name. Use a PostgreSQL identifier of up to 63 characters.`, [table?.id].filter(Boolean)));
      continue;
    }
    if (names.has(column.name.toLowerCase())) {
      errors.push(error("sql.duplicate-column", `Table '${table?.name || table?.id}' repeats column '${column.name}'.`, [table?.id].filter(Boolean)));
      continue;
    }
    names.add(column.name.toLowerCase());
    const type = String(column.type || "").trim().toUpperCase().replace(/\s+/g, " ");
    const sizedType = /^(VARCHAR|CHAR)\((\d{1,4})\)$/.exec(type);
    const numericType = /^NUMERIC\((\d{1,4})(?:,(\d{1,4}))?\)$/.exec(type);
    if (!POSTGRES_TYPES.has(type) && !sizedType && !numericType) {
      errors.push(error("sql.unsupported-column-type", `Column '${column.name}' uses unsupported PostgreSQL type '${column.type}'.`, [table?.id].filter(Boolean)));
      continue;
    }
    if (sizedType && Number(sizedType[2]) < 1) {
      errors.push(error("sql.invalid-column-type-size", `Column '${column.name}' must use a positive length.`, [table?.id].filter(Boolean)));
      continue;
    }
    if (numericType) {
      const precision = Number(numericType[1]);
      const scale = numericType[2] == null ? 0 : Number(numericType[2]);
      if (precision < 1 || precision > 1000 || scale > precision) {
        errors.push(error("sql.invalid-numeric-size", `Column '${column.name}' has invalid NUMERIC precision/scale.`, [table?.id].filter(Boolean)));
        continue;
      }
    }
    if (column.primaryKey === true) primaryKeys.push(column.name);
  }
  if (primaryKeys.length > 1) {
    // Composite primary keys are valid, supported below.
  }
  if (names.size !== columns.length) return null;
  return columns.map((column) => ({ ...column, type: String(column.type).trim().toUpperCase().replace(/\s+/g, " ") }));
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function parseIndexes(table, columns, errors) {
  const raw = table?.properties?.indexes;
  if (raw == null || String(raw).trim() === "") return [];
  let indexes;
  try {
    indexes = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    errors.push(error("sql.invalid-indexes-json", `Table '${table?.name || table?.id}' has invalid JSON in its indexes field.`, [table?.id].filter(Boolean)));
    return [];
  }
  if (!Array.isArray(indexes)) {
    errors.push(error("sql.indexes-required-array", `Table '${table?.name || table?.id}' indexes must be a JSON array.`, [table?.id].filter(Boolean)));
    return [];
  }
  const knownColumns = new Set(columns.map((column) => column.name.toLowerCase()));
  const seenNames = new Set();
  const normalized = [];
  for (const index of indexes) {
    if (!objectLike(index)) {
      errors.push(error("sql.invalid-index", `Table '${table?.name || table?.id}' contains an index that is not an object.`, [table?.id].filter(Boolean)));
      continue;
    }
    if (typeof index.name !== "string" || !IDENTIFIER.test(index.name)) {
      errors.push(error("sql.invalid-index-name", `Table '${table?.name || table?.id}' has an invalid index name. Use a PostgreSQL identifier of up to 63 characters.`, [table?.id].filter(Boolean)));
      continue;
    }
    if (seenNames.has(index.name.toLowerCase())) {
      errors.push(error("sql.duplicate-index-name", `Table '${table?.name || table?.id}' repeats index name '${index.name}'.`, [table?.id].filter(Boolean)));
      continue;
    }
    seenNames.add(index.name.toLowerCase());
    if (!Array.isArray(index.columns) || index.columns.length === 0 || !index.columns.every((name) => typeof name === "string" && IDENTIFIER.test(name) && knownColumns.has(name.toLowerCase()))) {
      errors.push(error("sql.invalid-index-columns", `Index '${index.name}' must reference one or more valid columns on table '${table?.name || table?.id}'.`, [table?.id].filter(Boolean)));
      continue;
    }
    if (index.unique != null && typeof index.unique !== "boolean") {
      errors.push(error("sql.invalid-index-unique", `Index '${index.name}' unique must be a boolean when provided.`, [table?.id].filter(Boolean)));
      continue;
    }
    const method = index.method == null ? "btree" : String(index.method).toLowerCase();
    if (method !== "btree") {
      errors.push(error("sql.unsupported-index-method", `Index '${index.name}' uses unsupported method '${index.method}'. Only btree indexes are generated by this prototype.`, [table?.id].filter(Boolean)));
      continue;
    }
    normalized.push({ name: index.name, columns: [...index.columns], unique: index.unique === true, method });
  }
  return normalized;
}

/** Generate portable PostgreSQL DDL from database -> table semantic relations. */
export function generateSqlArtifact(workbench) {
  const entities = Array.isArray(workbench?.entities) ? workbench.entities : [];
  const relations = Array.isArray(workbench?.relations) ? workbench.relations : [];
  const databases = entities.filter((entity) => entity?.kind === "data.postgresql-database");
  const tables = entities.filter((entity) => entity?.kind === "data.postgresql-table");
  const errors = [];
  const warnings = [];

  if (databases.length === 0) errors.push(error("sql.no-database", "Add a PostgreSQL component before generating SQL."));
  if (databases.length > 1) errors.push(error("sql.multiple-databases", "This initial SQL generator creates one PostgreSQL target per artifact. Keep a single PostgreSQL component in the model before generating a script."));
  if (tables.length === 0) errors.push(error("sql.no-tables", "Add at least one PostgreSQL table, define its columns, and connect it to a database with Contains table."));

  const dbById = new Map(databases.map((database) => [database.id, database]));
  const tableById = new Map(tables.map((table) => [table.id, table]));
  const tablesPerSchema = new Set();
  const indexesPerSchema = new Set();
  const scopedName = workbench?.artifactScope?.serviceName;
  const statements = ["-- Generated by Sketchizi Engineering Workbench.", `-- Source model revision: ${Number.isSafeInteger(workbench?.modelRevision) ? workbench.modelRevision : 0}.`, ...(scopedName ? [`-- HLD artifact scope: ${String(scopedName).replace(/[\r\n]/g, " ")}.`] : []), "-- Review and test this preview before applying it to a database.", ""];

  for (const database of databases) {
    const props = database.properties || {};
    const schemaName = String(props.schema || "public").trim();
    if (!IDENTIFIER.test(schemaName)) {
      errors.push(error("sql.invalid-schema-name", `PostgreSQL component '${database.name || database.id}' has an invalid schema name.`, [database.id]));
      continue;
    }
    const tableRelations = relations.filter((relation) => relation?.kind === "contains-table" && relation.sourceId === database.id && tableById.has(relation.targetId));
    statements.push(`-- Database model: ${String(props.databaseName || database.name || "app_db").replace(/[\r\n]+/g, " ")}`);
    statements.push(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schemaName)};`, "");
    const ownedIds = new Set();
    for (const relation of tableRelations) {
      if (ownedIds.has(relation.targetId)) continue;
      ownedIds.add(relation.targetId);
      const table = tableById.get(relation.targetId);
      const tableName = String(table.properties?.tableName || table.name || "").trim();
      if (!IDENTIFIER.test(tableName)) {
        errors.push(error("sql.invalid-table-name", `Table '${table.name || table.id}' has an invalid tableName.`, [table.id]));
        continue;
      }
      const signature = `${schemaName.toLowerCase()}.${tableName.toLowerCase()}`;
      if (tablesPerSchema.has(signature)) {
        errors.push(error("sql.duplicate-table", `Table '${schemaName}.${tableName}' is connected more than once or conflicts with another modeled table.`, [database.id, table.id]));
        continue;
      }
      tablesPerSchema.add(signature);
      const columns = parseColumns(table, errors);
      if (!columns) continue;
      const columnLines = columns.map((column) => {
        const nullable = column.nullable === false || column.primaryKey === true ? " NOT NULL" : "";
        const unique = column.unique === true && column.primaryKey !== true ? " UNIQUE" : "";
        return `  ${quoteIdentifier(column.name)} ${column.type}${nullable}${unique}`;
      });
      const primaryKeys = columns.filter((column) => column.primaryKey === true).map((column) => column.name);
      if (primaryKeys.length) columnLines.push(`  PRIMARY KEY (${primaryKeys.map(quoteIdentifier).join(", ")})`);
      statements.push(`CREATE TABLE IF NOT EXISTS ${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)} (\n${columnLines.join(",\n")}\n);`, "");
      const indexes = parseIndexes(table, columns, errors);
      for (const index of indexes) {
        const indexSignature = `${schemaName.toLowerCase()}.${index.name.toLowerCase()}`;
        if (indexesPerSchema.has(indexSignature)) {
          errors.push(error("sql.duplicate-schema-index-name", `Index name '${index.name}' is repeated in schema '${schemaName}'.`, [database.id, table.id]));
          continue;
        }
        indexesPerSchema.add(indexSignature);
        const unique = index.unique ? "UNIQUE " : "";
        const targetColumns = index.columns.map(quoteIdentifier).join(", ");
        statements.push(`CREATE ${unique}INDEX IF NOT EXISTS ${quoteIdentifier(index.name)} ON ${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)} USING ${index.method} (${targetColumns});`, "");
      }
    }
    const reverseOwnership = tables.filter((table) => relations.some((relation) => relation?.kind === "contains-table" && relation.targetId === table.id && relation.sourceId === database.id));
    if (reverseOwnership.length === 0) warnings.push(warning("sql.database-without-tables", `PostgreSQL component '${database.name || database.id}' has no modeled tables.`, [database.id]));
  }

  for (const table of tables) {
    const owners = relations.filter((relation) => relation?.kind === "contains-table" && relation.targetId === table.id && dbById.has(relation.sourceId));
    if (owners.length !== 1) {
      errors.push(error("sql.table-owner-count", `Table '${table.name || table.id}' must belong to exactly one PostgreSQL component using Contains table.`, [table.id, ...owners.map((relation) => relation.sourceId)]));
    }
  }

  const text = statements.join("\n").trimEnd() + "\n";
  const scopedSlug = String(workbench?.artifactScope?.serviceName || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return result({ kind: "sql", filename: scopedSlug ? `schema-${scopedSlug}.sql` : "schema.sql", mimeType: "text/sql;charset=utf-8", value: text, errors, warnings, modelRevision: workbench?.modelRevision });
}
