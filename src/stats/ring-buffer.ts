/** Fixed-capacity buffer that overwrites its oldest entry when full. */
export class RingBuffer<T> {
  private readonly items: T[] = [];
  private start = 0;

  constructor(readonly capacity: number) {}

  get length(): number {
    return this.items.length;
  }

  push(item: T): void {
    if (this.items.length < this.capacity) {
      this.items.push(item);
      return;
    }
    this.items[this.start] = item;
    this.start = (this.start + 1) % this.capacity;
  }

  /** Items from oldest to newest. */
  toArray(): T[] {
    return [...this.items.slice(this.start), ...this.items.slice(0, this.start)];
  }

  clear(): void {
    this.items.length = 0;
    this.start = 0;
  }
}
