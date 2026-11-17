import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { WalletStatus } from './domain/types';
import { CreateWalletDto, TopUpDto, TransferDto, WithdrawDto } from './dto/dto';
import { type TxnResult, WalletService } from './wallet.service';

@ApiTags('Wallet')
@Controller()
export class WalletController {
  constructor(private readonly wallets: WalletService) {}

  @Post('wallets')
  create(@Body() dto: CreateWalletDto) {
    return this.wallets.create(dto.userId);
  }

  /** Before /wallets/:id so "ledger-check" isn't read as an id. */
  @Get('wallets/ledger-check')
  ledgerCheck() {
    return this.wallets.checkLedger();
  }

  @Get('wallets/:id')
  get(@Param('id') id: string) {
    return this.wallets.get(id);
  }

  @Post('wallets/:id/top-ups')
  async topUp(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: TopUpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.wallets.topUp(id, key, dto));
  }

  @Post('wallets/:id/transfers')
  transfer(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: TransferDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, this.wallets.transfer(id, key, dto));
  }

  @Post('wallets/:id/withdrawals')
  async withdraw(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: WithdrawDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.wallets.withdraw(id, key, dto));
  }

  @Get('wallets/:id/statement')
  statement(@Param('id') id: string, @Query() page: PaginationDto) {
    return this.wallets.statement(id, page);
  }

  @Get('wallets/:id/transactions')
  transactions(@Param('id') id: string) {
    return this.wallets.transactions(id);
  }

  @Get('wallets/:id/reconcile')
  reconcile(@Param('id') id: string) {
    return this.wallets.reconcile(id);
  }

  @Post('wallets/:id/freeze')
  @HttpCode(200)
  freeze(@Param('id') id: string) {
    return this.wallets.setStatus(id, WalletStatus.FROZEN);
  }

  @Post('wallets/:id/unfreeze')
  @HttpCode(200)
  unfreeze(@Param('id') id: string) {
    return this.wallets.setStatus(id, WalletStatus.ACTIVE);
  }

  @Get('wallet-transactions/:id')
  transaction(@Param('id') id: string) {
    return this.wallets.transaction(id);
  }

  /** 201 for a new transaction, 200 + Idempotent-Replayed for a repeat of the same key. */
  private respond(res: Response, result: TxnResult) {
    if (result.replayed) {
      res.status(200);
      res.setHeader('Idempotent-Replayed', 'true');
    }
    return result.transaction;
  }
}
