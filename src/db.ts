import Dexie, { type Table } from 'dexie';
import type { ImageAsset, Note } from './data';

interface Setting {
  key: string;
  value: string;
}

class AzeDB extends Dexie {
  notes!: Table<Note, string>;
  settings!: Table<Setting, string>;
  imageAssets!: Table<ImageAsset, string>;

  constructor() {
    super('aze');
    this.version(1).stores({ notes: 'path, created, updated' });
    this.version(2).stores({ notes: 'path, created, updated', settings: 'key' });
    this.version(3).stores({
      notes: 'path, created, updated',
      settings: 'key',
      imageAssets: 'id, notePath, created',
    });
  }
}

export const db = new AzeDB();
