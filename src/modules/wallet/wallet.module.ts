import { Module } from '@nestjs/common';
import { PAYMENT_RAILS } from './domain/payment-rails';
import { DEFAULT_WALLET_OPTIONS, WALLET_OPTIONS } from './domain/wallet-options';
import { FakePaymentRails } from './payments/fake-payment-rails';
import { LedgerRepository, TransactionRepository, WalletRepository } from './repositories';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  controllers: [WalletController],
  providers: [
    WalletRepository,
    TransactionRepository,
    LedgerRepository,
    { provide: WALLET_OPTIONS, useValue: DEFAULT_WALLET_OPTIONS },
    { provide: PAYMENT_RAILS, useClass: FakePaymentRails },
    WalletService,
  ],
})
export class WalletModule {}
