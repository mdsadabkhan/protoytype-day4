import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

interface ValidationSchema {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
}

export const validateRequest = (schema: any) => {
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
  };
};

function createJoiSchema(schemaDefinition: any): Joi.ObjectSchema {
  const joiObject: any = {};

  for (const [key, definition] of Object.entries(schemaDefinition as any)) {
    let joiField: any;

    switch (definition.type) {
      case 'string':
        joiField = Joi.string();
        if (definition.minLength) joiField = joiField.min(definition.minLength);
        if (definition.maxLength) joiField = joiField.max(definition.maxLength);
        if (definition.pattern) joiField = joiField.pattern(definition.pattern);
        if (definition.enum) joiField = joiField.valid(...definition.enum);
        break;
      
      case 'number':
        joiField = Joi.number();
        if (definition.min !== undefined) joiField = joiField.min(definition.min);
        if (definition.max !== undefined) joiField = joiField.max(definition.max);
        break;
      
      case 'boolean':
        joiField = Joi.boolean();
        break;
      
      case 'array':
        joiField = Joi.array();
        if (definition.items) joiField = joiField.items(createJoiSchema({ item: definition.items }).extract('item'));
        break;
      
      case 'object':
        joiField = Joi.object();
        break;
      
      default:
        joiField = Joi.any();
    }

    if (definition.required) {
      joiField = joiField.required();
    } else {
      joiField = joiField.optional();
    }

    joiObject[key] = joiField;
  }

  return Joi.object(joiObject);
}