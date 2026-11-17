import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { CreateInput } from '../../common/repository/repository.interface';
import { Employee } from './entities/employee.entity';

/** Indexes: email → id (uniqueness), managerId → direct reports (pending approvals). */
@Injectable()
export class EmployeeRepository extends InMemoryRepository<Employee> {
  private readonly byEmail = new Map<string, string>();
  private readonly reportsOf = new Map<string, string[]>();

  constructor() {
    super('Employee', 'emp');
  }

  override create(data: CreateInput<Employee>): Employee {
    const employee = super.create(data);
    this.byEmail.set(employee.email, employee.id);
    if (employee.managerId) {
      const list = this.reportsOf.get(employee.managerId) ?? [];
      list.push(employee.id);
      this.reportsOf.set(employee.managerId, list);
    }
    return employee;
  }

  findByEmail(email: string): Employee | undefined {
    const id = this.byEmail.get(email);
    return id === undefined ? undefined : this.findById(id);
  }

  directReportIds(managerId: string): string[] {
    return [...(this.reportsOf.get(managerId) ?? [])];
  }
}
