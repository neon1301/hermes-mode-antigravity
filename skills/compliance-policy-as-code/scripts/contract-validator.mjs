/**
 * Hermes Fleet Enterprise - Mechanical Contract Validator (REQ-9)
 * Validates cross-agent DTOs, Blueprints, and Verdicts against JSON Schemas.
 * Zero npm dependencies (stdlib only).
 */

export function validateSchema(data, schema, currentPath = '$') {
  const errors = [];

  if (schema == null || typeof schema !== 'object') {
    return { valid: true, errors: [] };
  }

  // Type check
  if (schema.type) {
    const expectedType = schema.type;
    if (expectedType === 'object') {
      if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        errors.push({ path: currentPath, message: `Expected object, got ${Array.isArray(data) ? 'array' : typeof data}` });
        return { valid: false, errors };
      }
    } else if (expectedType === 'array') {
      if (!Array.isArray(data)) {
        errors.push({ path: currentPath, message: `Expected array, got ${typeof data}` });
        return { valid: false, errors };
      }
    } else if (expectedType === 'string') {
      if (typeof data !== 'string') {
        errors.push({ path: currentPath, message: `Expected string, got ${typeof data}` });
        return { valid: false, errors };
      }
    } else if (expectedType === 'integer') {
      if (!Number.isInteger(data)) {
        errors.push({ path: currentPath, message: `Expected integer, got ${typeof data}` });
        return { valid: false, errors };
      }
    } else if (expectedType === 'number') {
      if (typeof data !== 'number' || isNaN(data)) {
        errors.push({ path: currentPath, message: `Expected number, got ${typeof data}` });
        return { valid: false, errors };
      }
    } else if (expectedType === 'boolean') {
      if (typeof data !== 'boolean') {
        errors.push({ path: currentPath, message: `Expected boolean, got ${typeof data}` });
        return { valid: false, errors };
      }
    }
  }

  // Enum check
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.includes(data)) {
      errors.push({ path: currentPath, message: `Value '${data}' is not in allowed enum: [${schema.enum.join(', ')}]` });
    }
  }

  // Number bounds
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push({ path: currentPath, message: `Value ${data} is less than minimum ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push({ path: currentPath, message: `Value ${data} is greater than maximum ${schema.maximum}` });
    }
  }

  // Object checks
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    // Required fields
    if (Array.isArray(schema.required)) {
      for (const reqField of schema.required) {
        if (!Object.prototype.hasOwnProperty.call(data, reqField) || data[reqField] === undefined) {
          errors.push({ path: `${currentPath}.${reqField}`, message: `Missing required property '${reqField}'` });
        }
      }
    }

    // Properties validation
    if (schema.properties && typeof schema.properties === 'object') {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (Object.prototype.hasOwnProperty.call(data, propName) && data[propName] !== undefined) {
          const res = validateSchema(data[propName], propSchema, `${currentPath}.${propName}`);
          if (!res.valid) {
            errors.push(...res.errors);
          }
        }
      }
    }
  }

  // Array items check
  if (Array.isArray(data) && schema.items && typeof schema.items === 'object') {
    data.forEach((item, idx) => {
      const res = validateSchema(item, schema.items, `${currentPath}[${idx}]`);
      if (!res.valid) {
        errors.push(...res.errors);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
