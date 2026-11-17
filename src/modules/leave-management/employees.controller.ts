import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BalancesQuery } from './dto/leave-queries';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeesService } from './employees.service';
import { LeavesService } from './leaves.service';

@ApiTags('Leave Management')
@Controller()
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly leaves: LeavesService,
  ) {}

  @Post('employees')
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  @Get('employees')
  list() {
    return this.employees.list();
  }

  @Get('employees/:id')
  get(@Param('id') id: string) {
    return this.employees.get(id);
  }

  @Get('employees/:id/balances')
  balances(@Param('id') id: string, @Query() query: BalancesQuery) {
    return this.employees.balancesOf(id, query.year);
  }

  /** The manager's inbox: PENDING leaves of direct reports, soonest first. */
  @Get('managers/:id/pending-approvals')
  pendingApprovals(@Param('id') id: string) {
    return this.leaves.pendingApprovals(id);
  }
}
