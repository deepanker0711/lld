import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateWalletDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}

/** Amounts are integer paise: ₹250.50 = 25050. Limits are checked in the service. */
export class TopUpDto {
  @IsInt()
  @Min(1)
  amountPaise: number;

  /** "tok_decline" simulates a declined card. */
  @IsString()
  @IsNotEmpty()
  paymentToken: string;
}

export class TransferDto {
  @IsString()
  @IsNotEmpty()
  toWalletId: string;

  @IsInt()
  @Min(1)
  amountPaise: number;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  note?: string;
}

export class WithdrawDto {
  @IsInt()
  @Min(1)
  amountPaise: number;

  /** Ending in 0000 simulates a rejected payout. */
  @Matches(/^\d{9,18}$/, { message: 'bankAccount must be 9-18 digits' })
  bankAccount: string;
}
