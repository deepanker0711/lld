import { applyDecorators } from '@nestjs/common';
import { IsISO8601, Matches, type ValidationOptions } from 'class-validator';

/**
 * A calendar date 'YYYY-MM-DD' that really exists (2026-02-30 fails).
 * Matches rejects times and offsets; IsISO8601 strict checks the calendar.
 */
export const IsDateOnly = (options?: ValidationOptions) =>
  applyDecorators(
    Matches(/^\d{4}-\d{2}-\d{2}$/, {
      message: '$property must be a date like 2026-11-03',
      ...options,
    }),
    IsISO8601(
      { strict: true },
      { message: '$property is not a real calendar date', ...options },
    ),
  );
