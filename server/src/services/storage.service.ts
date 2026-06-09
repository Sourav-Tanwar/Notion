import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';

/**
 * Storage adapter: the avatar/file pipeline talks to this interface, never to
 * a concrete backend. Today's only backend is the local filesystem; adding S3
 * is `export class S3Adapter implements StorageAdapter` and a switch in
 * `getStorage()`.
 */
export interface StorageAdapter {
  /** Save a buffer under a logical key. Returns a public URL. */
  save(key: string, buf: Buffer, contentType: string): Promise<string>;
  /** Best-effort delete; missing files do not throw. */
  remove(key: string): Promise<void>;
}

class LocalDiskAdapter implements StorageAdapter {
  constructor(private root: string, private publicBase: string) {}

  private full(key: string): string {
    // Defense against `../` escapes.
    const safe = key.replace(/^\/+/, '').replace(/\.\.+/g, '');
    return path.join(this.root, safe);
  }

  async save(key: string, buf: Buffer, _ct: string): Promise<string> {
    const dest = this.full(key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buf);
    return `${this.publicBase}/${env.uploadDir}/${key}`.replace(/([^:]\/)\/+/g, '$1');
  }

  async remove(key: string): Promise<void> {
    try {
      await fs.unlink(this.full(key));
    } catch {
      /* ignore */
    }
  }
}

let _storage: StorageAdapter | null = null;
export function getStorage(): StorageAdapter {
  if (_storage) return _storage;
  switch (env.storageDriver) {
    case 's3':
      throw new Error('S3 driver not yet wired');
    case 'local':
    default:
      _storage = new LocalDiskAdapter(path.resolve(env.uploadDir), env.publicBaseUrl);
  }
  return _storage;
}
