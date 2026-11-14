/**
 * A tiny typed registry. Every pluggable module (tunings, scales, harmonies,
 * translations, ensembles) registers itself under an id; recipes refer to
 * modules only by id, so adding a new "musical language" is one new file.
 */
export interface Module {
  id: string
  label: string
  /** Licence of any third-party material inside the module. */
  license?: string
  tags?: string[]
}

export class Registry<T extends Module> {
  private items = new Map<string, T>()
  constructor(readonly kind: string) {}

  add(item: T): T {
    if (this.items.has(item.id)) throw new Error(`${this.kind} "${item.id}" already registered`)
    this.items.set(item.id, item)
    return item
  }

  get(id: string): T {
    const item = this.items.get(id)
    if (!item) throw new Error(`Unknown ${this.kind} "${id}". Known: ${[...this.items.keys()].join(', ')}`)
    return item
  }

  list(): T[] {
    return [...this.items.values()]
  }
}
