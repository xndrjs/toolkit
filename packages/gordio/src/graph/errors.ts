export class ArchitectureGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchitectureGraphError";
  }
}
