import { Transform } from 'class-transformer';

/**
 * Skip enableImplicitConversion for this property: validate exactly what the client sent.
 *
 * Needed for booleans: implicit conversion runs Boolean(value) before validation, so
 * "no", "false" and 1 all become true and @IsBoolean() passes. With @RawValue() the
 * original value reaches @IsBoolean() and a non-boolean is rejected.
 * `obj` is the incoming plain object, so obj[key] is the untouched value.
 */
export const RawValue = () =>
  Transform(({ obj, key }) => (obj as Record<string, unknown>)[key]);
