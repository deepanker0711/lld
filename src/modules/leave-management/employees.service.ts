import { Inject, Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
} from '../../common/errors/domain.errors';
import { Clock } from '../../common/utils/clock';
import { todayIn } from './domain/leave-dates';
import { LEAVE_OPTIONS, type LeaveOptions } from './domain/leave-options';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeRepository } from './employee.repository';
import { Employee } from './entities/employee.entity';
import { BalanceView, LeaveBalanceService } from './leave-balance.service';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly balances: LeaveBalanceService,
    private readonly clock: Clock,
    @Inject(LEAVE_OPTIONS) private readonly options: LeaveOptions,
  ) {}

  create(dto: CreateEmployeeDto): Employee & { balances: BalanceView[] } {
    if (this.employees.findByEmail(dto.email)) {
      throw new ConflictError(
        `Employee with email '${dto.email}' already exists`,
      );
    }
    // The manager must exist first, which also makes reporting cycles impossible.
    if (dto.managerId) this.get(dto.managerId);

    const employee = this.employees.create({
      name: dto.name,
      email: dto.email,
      managerId: dto.managerId ?? null,
    });
    const year = this.currentYear();
    this.balances.seedYear(employee.id, year);
    return { ...employee, balances: this.balances.view(employee.id, year) };
  }

  get(id: string): Employee {
    const employee = this.employees.findById(id);
    if (!employee) throw new NotFoundError('Employee', id);
    return employee;
  }

  list(): Employee[] {
    return this.employees.findAll();
  }

  /** Uses the repository's managerId → reports index, not a scan. */
  directReports(managerId: string): Employee[] {
    return this.employees
      .directReportIds(managerId)
      .map((id) => this.employees.findByIdOrThrow(id));
  }

  balancesOf(id: string, year = this.currentYear()): BalanceView[] {
    this.get(id);
    return this.balances.view(id, year);
  }

  private currentYear(): number {
    return Number(
      todayIn(this.options.timeZone, this.clock.date()).slice(0, 4),
    );
  }
}
