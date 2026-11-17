import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApplyLeaveDto } from './dto/apply-leave.dto';
import {
  ApproveLeaveDto,
  CancelLeaveDto,
  RejectLeaveDto,
} from './dto/decide-leave.dto';
import { ListLeavesQuery } from './dto/leave-queries';
import { LeavesService } from './leaves.service';

@ApiTags('Leave Management')
@Controller('leaves')
export class LeavesController {
  constructor(private readonly service: LeavesService) {}

  @Post()
  apply(@Body() dto: ApplyLeaveDto) {
    return this.service.apply(dto);
  }

  @Get()
  list(@Query() query: ListLeavesQuery) {
    return this.service.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  /** Actions on an existing resource: POST .../approve with 200, nothing is created. */
  @Post(':id/approve')
  @HttpCode(200)
  approve(@Param('id') id: string, @Body() dto: ApproveLeaveDto) {
    return this.service.approve(id, dto.approverId, dto.comment);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@Param('id') id: string, @Body() dto: RejectLeaveDto) {
    return this.service.reject(id, dto.approverId, dto.comment);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @Body() dto: CancelLeaveDto) {
    return this.service.cancel(id, dto.employeeId);
  }
}
