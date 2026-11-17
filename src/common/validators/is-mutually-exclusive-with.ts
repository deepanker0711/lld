import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Fails when this property AND `otherProperty` are both present (not null/undefined).
 * Put it on one of the two fields, together with @IsOptional():
 *
 *   @IsOptional() @IsISO8601() runAt?: string;
 *   @IsOptional() @IsInt() @IsMutuallyExclusiveWith('runAt') delayMs?: number;
 *
 * @IsOptional skips every validator when this field is missing, so the check only
 * runs when this field was sent, which is exactly when a clash is possible.
 */
export function IsMutuallyExclusiveWith(
  otherProperty: string,
  options?: ValidationOptions,
) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isMutuallyExclusiveWith',
      target: object.constructor,
      propertyName,
      constraints: [otherProperty],
      options: {
        message: `${propertyName} and ${otherProperty} cannot be used together`,
        ...options,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const other = (args.object as Record<string, unknown>)[
            args.constraints[0] as string
          ];
          return value == null || other == null;
        },
      },
    });
  };
}
