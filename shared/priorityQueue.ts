/** Stable minimum heap: ties preserve the insertion order of the old sorted queue. */
export class StableMinQueue<T> {
  private heap: { value: T; priority: number; order: number }[] = [];
  private order = 0;
  get size() { return this.heap.length; }
  private before(a: {priority:number;order:number}, b: {priority:number;order:number}) { return a.priority < b.priority || (a.priority === b.priority && a.order < b.order); }
  push(value:T, priority:number) {
    const item = { value, priority, order: this.order++ };
    this.heap.push(item);
    let i = this.heap.length-1;
    while (i>0) { const parent = Math.floor((i-1)/2); if (!this.before(item,this.heap[parent]!)) break; this.heap[i]=this.heap[parent]!; i=parent; }
    this.heap[i]=item;
  }
  pop(): T | undefined {
    const first=this.heap[0]; if (!first) return undefined;
    const last=this.heap.pop()!;
    if (this.heap.length) {
      let i=0;
      while (i*2+1<this.heap.length) {
        let child=i*2+1;
        if (child+1<this.heap.length && this.before(this.heap[child+1]!,this.heap[child]!)) child++;
        if (!this.before(this.heap[child]!,last)) break;
        this.heap[i]=this.heap[child]!; i=child;
      }
      this.heap[i]=last;
    }
    return first.value;
  }
}
