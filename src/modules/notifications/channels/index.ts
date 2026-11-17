import { EmailChannelSender } from './email-channel.sender';
import { PushChannelSender } from './push-channel.sender';
import { SmsChannelSender } from './sms-channel.sender';

export { EmailChannelSender, PushChannelSender, SmsChannelSender };

/** Every sender class. The module turns this into one CHANNEL_SENDERS array. */
export const CHANNEL_SENDER_CLASSES = [
  EmailChannelSender,
  SmsChannelSender,
  PushChannelSender,
];
