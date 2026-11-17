import { Injectable, Logger } from '@nestjs/common';
import { JobHandler } from '../domain/job-handler';

@Injectable()
export class SendEmailHandler implements JobHandler {
  readonly type = 'send_email';
  private readonly logger = new Logger(SendEmailHandler.name);

  async handle(payload: Record<string, unknown>): Promise<void> {
    const { to, subject, body } = payload;

    if (!to || !subject || !body) {
      this.logger.error('Missing required email fields in payload');
      throw new Error('Missing required email fields in payload');
    }

    // Simulate sending an email
    this.logger.log(`Sending email to: ${to}`);
    this.logger.log(`Subject: ${subject}`);
    this.logger.log(`Body: ${body}`);

    // Here you would integrate with an actual email service
  }
}
