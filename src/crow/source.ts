import { Subscriber, Observable } from "rxjs";

/*
 * An event source has a set of subscribers, and emits events to all of them.
 */
export class EventSource<T> extends Observable<T> {
  listeners = new Set<Subscriber<T>>();

  constructor() {
    super((observer: Subscriber<T>) => {
      this.listeners.add(observer);
      return () => {
        this.listeners.delete(observer);
      };
    });
  }

  emit(event: T) {
    if (this.listeners.size == 0) return;
    for (const listener of this.listeners) {
      listener.next(event);
    }
  }

  get subscriberCount() {
    return this.listeners.size;
  }
}
