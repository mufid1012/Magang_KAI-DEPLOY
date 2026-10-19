/** Small process-local cache with bounded memory and lazy expiry. */
export class ExpiringCache<T> {
  private entries = new Map<string, {expiresAt:number; value:T}>();
  constructor(private limit:number, private ttl:number) {}
  get(key:string, now=Date.now()):T|undefined { const entry=this.entries.get(key); if (!entry) return undefined; if (entry.expiresAt<=now) { this.entries.delete(key); return undefined; } return entry.value; }
  set(key:string,value:T,now=Date.now()) { for (const [k,e] of this.entries) if (e.expiresAt<=now) this.entries.delete(k); this.entries.delete(key); this.entries.set(key,{expiresAt:now+this.ttl,value}); while (this.entries.size>this.limit) this.entries.delete(this.entries.keys().next().value!); }
  get size(){ return this.entries.size; }
}
