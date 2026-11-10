export interface Diagnostic {
  line: number;
  reason: string;
}

/** What the parser could not honour; the content itself is always kept. */
export class DiagnosticsList {
  private readonly entries: Diagnostic[] = [];

  add(line: number, reason: string): void {
    this.entries.push({ line, reason });
  }

  count(): number {
    return this.entries.length;
  }

  items(): readonly Diagnostic[] {
    return this.entries;
  }

  describe(): string {
    return this.entries.map((d) => `Line ${d.line}: ${d.reason}`).join('\n');
  }
}
