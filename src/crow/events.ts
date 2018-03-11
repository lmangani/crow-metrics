export type Listener<A> = (item: A) => void;
export type Transform<A, B> = (item: A) => B;
export type Filter<A> = (item: A) => boolean;

/*
 * An event source has a set of subscribers, and emits events to all of them.
 */
export class EventSource<A> {
  listeners = new Set<Listener<A>>();

  post(event: A) {
    if (this.listeners.size == 0) return;
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  forEach(listener: Listener<A>) {
    this.listeners.add(listener);
  }

  remove(listener: Listener<A>) {
    this.listeners.delete(listener);
  }

  map<B>(f: Transform<A, B>): EventSource<B> {
    const rv = new EventSource<B>();
    this.forEach(item => rv.post(f(item)));
    return rv;
  }

  filter(f: Filter<A>): EventSource<A> {
    const rv = new EventSource<A>();
    this.forEach(item => {
      if (f(item)) rv.post(item);
    });
    return rv;
  }

  get subscriberCount() {
    return this.listeners.size;
  }
}
