import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AddExpenseDto, AddGroupMemberDto, CreateGroupDto, CreateMemberDto, SettleDto } from './dto/dto';
import { SplitwiseService } from './splitwise.service';

@ApiTags('Splitwise')
@Controller('splitwise')
export class SplitwiseController {
  constructor(private readonly service: SplitwiseService) {}

  @Post('members')
  createMember(@Body() dto: CreateMemberDto) {
    return this.service.createMember(dto);
  }

  @Get('members')
  members() {
    return this.service.listMembers();
  }

  @Get('members/:id/summary')
  summary(@Param('id') id: string) {
    return this.service.memberSummary(id);
  }

  @Post('groups')
  createGroup(@Body() dto: CreateGroupDto) {
    return this.service.createGroup(dto);
  }

  @Get('groups/:id')
  group(@Param('id') id: string) {
    return this.service.getGroup(id);
  }

  @Post('groups/:id/members')
  addMember(@Param('id') id: string, @Body() dto: AddGroupMemberDto) {
    return this.service.addMember(id, dto.memberId);
  }

  @Delete('groups/:id/members/:memberId')
  removeMember(@Param('id') id: string, @Param('memberId') memberId: string) {
    return this.service.removeMember(id, memberId);
  }

  @Post('groups/:id/expenses')
  addExpense(@Param('id') id: string, @Body() dto: AddExpenseDto) {
    return this.service.addExpense(id, dto);
  }

  @Get('groups/:id/expenses')
  expenses(@Param('id') id: string) {
    return this.service.listExpenses(id);
  }

  @Delete('groups/:id/expenses/:expenseId')
  deleteExpense(@Param('id') id: string, @Param('expenseId') expenseId: string) {
    return this.service.deleteExpense(id, expenseId);
  }

  @Get('groups/:id/balances')
  balances(@Param('id') id: string) {
    return this.service.balances(id);
  }

  @Post('groups/:id/settlements')
  settle(@Param('id') id: string, @Body() dto: SettleDto) {
    return this.service.settle(id, dto);
  }
}
