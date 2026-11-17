import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { SequenceGenerator, toBase62 } from '../../../common/utils/id.generator';

/**
 * Strategy: how a short code is produced. The service only asks for a candidate
 * and checks it is free, so generators don't need to know about storage.
 */
export interface CodeGenerator {
  next(): string;
}

export const CODE_GENERATOR = Symbol('CODE_GENERATOR');

/**
 * Counter -> base62. No collisions between generated codes, shortest possible
 * output (62^4 ≈ 14.7M codes fit in 4 chars). Downside: codes are sequential,
 * so anyone can enumerate links. In a multi-server setup the counter comes from
 * a DB sequence / Redis INCR, or each server gets its own id range.
 */
@Injectable()
export class Base62SequenceCodeGenerator implements CodeGenerator {
  constructor(private readonly sequence: SequenceGenerator) {}

  next(): string {
    return toBase62(this.sequence.next('short-url'));
  }
}

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Random 7-char base62 (62^7 ≈ 3.5 trillion). Not guessable, needs no shared
 * counter, but can collide, so the caller must retry on a taken code.
 * Swap it in with `{ provide: CODE_GENERATOR, useClass: RandomCodeGenerator }`.
 */
@Injectable()
export class RandomCodeGenerator implements CodeGenerator {
  next(length = 7): string {
    let code = '';
    for (let i = 0; i < length; i++) code += ALPHABET[randomInt(62)];
    return code;
  }
}
