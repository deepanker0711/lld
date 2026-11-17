import { FailAlwaysHandler } from './fail-always.handler';
import { FailRandomlyHandler } from './fail-randomly.handler';
import { GenerateReportHandler } from './generate-report.handler';
import { SendEmailHandler } from './send-email.handler';

/** Adding a job type = write a JobHandler class and add it here. Nothing else changes. */
export const HANDLER_CLASSES = [
  SendEmailHandler,
  GenerateReportHandler,
  FailRandomlyHandler,
  FailAlwaysHandler,
];
