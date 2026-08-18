import type { components, operations } from './codegen/api';

/**
 * Extract a schema type from `components.schemas` by key.
 *
 * @typeParam T - Schema name
 */
export type ApiSchema<T extends keyof components['schemas']> = components['schemas'][T];

/**
 * Extract the JSON request body type for an operation.
 *
 * Returns `never` if no JSON body is defined.
 *
 * @typeParam T - Operation name
 */

export type ApiRequest<T extends keyof operations> = operations[T] extends {
    requestBody: { content: { 'application/json': infer Body } }; // required
}
    ? Body
    : operations[T] extends {
            requestBody?: { content: { 'application/json': infer Body } }; // optional
        }
      ? Body
      : never;

/**
 * Extract the JSON response type for an operation.
 *
 * Supports `200` and `201` responses. Returns `never` if neither exists.
 *
 * @typeParam T - Operation name
 */
export type ApiResponse<T extends keyof operations> = operations[T] extends {
    responses: { 200: { content: { 'application/json': infer Res } } };
}
    ? Res
    : operations[T] extends {
            responses: {
                201: { content: { 'application/json': infer Res } };
            };
        }
      ? Res
      : never;
