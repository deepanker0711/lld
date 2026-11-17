import { EventEmitter } from 'node:events';

type Listener<P> = (payload: P) => void;

/**
 * Observer with typed events: `Events` maps event name → payload, so publish and
 * subscribe can't disagree on the shape. Extend it per module:
 *
 *   interface LeaveEvents { 'leave.approved': { leaveId: string } }
 *   @Injectable() export class LeaveEventBus extends TypedEventBus<LeaveEvents> {}
 *
 * In production this is Kafka/SQS/BullMQ; the method names stay the same.
 */
export class TypedEventBus<Events extends object> {
  private readonly emitter = new EventEmitter();

  publish<E extends keyof Events & string>(event: E, payload: Events[E]): void {
    // EventEmitter.emit() runs listeners synchronously, inside the caller's stack:
    // the HTTP handler would wait for every listener. Deferring to the next turn of the
    // event loop makes this a real hand-off: the response goes out first.
    setImmediate(() => this.emitter.emit(event, payload));
  }

  /** Returns an unsubscribe function. */
  subscribe<E extends keyof Events & string>(
    event: E,
    listener: Listener<Events[E]>,
  ): () => void {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }
}
