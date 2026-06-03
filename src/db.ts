import Dexie, { type Table } from "dexie";
import type { Note } from "./data";

class AzeDB extends Dexie {
  notes!: Table<Note, string>;

  constructor() {
    super("aze");
    this.version(1).stores({ notes: "path, created, updated" });
  }
}

export const db = new AzeDB();
