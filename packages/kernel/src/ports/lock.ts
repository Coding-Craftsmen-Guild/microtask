/** Serialises read-modify-write cycles against the same data. */
export interface Lock {
  /** Runs `work` once no earlier work is outstanding. */
  run<T>(work: () => Promise<T>): Promise<T>
}
