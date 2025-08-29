import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

interface ValidationSchema {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
}

export const validateRequest = (schema: ValidationSchema | { body?: any; query?: any; params?: any }) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const validationSchema: ValidationSchema = {};

    // Convert simple schema to Joi schema
    if (schema.body) {
      validationSchema.body = createJoiSchema(schema.body);
    }
    if (schema.query) {
      validationSchema.query = createJoiSchema(schema.query);
    }
    if (schema.params) {
      validationSchema.params = createJoiSchema(schema.params);
    }

    const validationErrors: string[] = [];

    // Validate body
    if (validationSchema.body) {
      const { error } = validationSchema.body.validate(req.body);
      if (error) {
        validationErrors.push(`Body: ${error.details.map(d => d.message).join(', ')}`);
      }
    }

    // Validate query
    if (validationSchema.query) {
      const { error } = validationSchema.query.validate(req.query);
      if (error) {
        validationErrors.push(`Query: ${error.details.map(d => d.message).join(', ')}`);
      }
    }

    // Validate params
    if (validationSchema.params) {
      const { error } = validationSchema.params.validate(req.params);
      if (error) {
        validationErrors.push(`Params: ${error.details.map(d => d.message).join(', ')}`);
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationErrors
      });
    }

    next();
    return;
  };
};

function createJoiSchema(schemaDefinition: Record<string, unknown>): Joi.ObjectSchema {
  const joiObject: Record<string, Joi.Schema> = {};

  for (const [key, definition] of Object.entries(schemaDefinition)) {
    let joiField: Joi.Schema;

    // Type guard for definition
    if (typeof definition !== 'object' || definition === null) {
      joiObject[key] = Joi.any();
      continue;
    }

    const def = definition as {
      type?: string;
      minLength?: number;
      maxLength?: number;
      pattern?: RegExp;
      enum?: any[];
      min?: number;
      max?: number;
      items?: any;
      required?: boolean;
      properties?: Record<string, unknown>;
    };

    switch (def.type) {
      case 'string':
        joiField = Joi.string();
        if (def.minLength !== undefined) joiField = (joiField as Joi.StringSchema).min(def.minLength);
        if (def.maxLength !== undefined) joiField = (joiField as Joi.StringSchema).max(def.maxLength);
        if (def.pattern !== undefined) joiField = (joiField as Joi.StringSchema).pattern(def.pattern);
        if (def.enum !== undefined) joiField = joiField.valid(...def.enum);
        break;

      case 'number':
        joiField = Joi.number();
        if (def.min !== undefined) joiField = (joiField as Joi.NumberSchema).min(def.min);
        if (def.max !== undefined) joiField = (joiField as Joi.NumberSchema).max(def.max);
        break;

      case 'boolean':
        joiField = Joi.boolean();
        break;

      case 'array':
        if (def.items) {
          joiField = Joi.array().items(createJoiSchema({ item: def.items }).extract('item'));
        } else {
          joiField = Joi.array();
        }
        break;

      case 'object':
        if (def.properties) {
          joiField = createJoiSchema(def.properties);
        } else {
          joiField = Joi.object();
        }
        break;

      default:
        joiField = Joi.any();
    }

    if (def.required) {
      joiField = joiField.required();
    } else {
      joiField = joiField.optional();
    }

    joiObject[key] = joiField;
  }

  return Joi.object(joiObject);
}