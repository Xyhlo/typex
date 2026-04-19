/**
 * Secret storage — API keys for remote AI providers.
 *
 * In the Tauri app we persist through the Rust `keyring` crate, which lands
 * in Windows Credential Manager, macOS Keychain, or Secret Service on Linux
 * (service name `TypeX`). In a non-Tauri context (dev browser) we fall back
 * to a namespaced localStorage entry so the preferences page still works.
 *
 * If a legacy localStorage value is present in Tauri we migrate it into the
 * keychain once and clear the plaintext copy.
 */
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../fs/files';

const PREFIX = 'typex:ai:secret:';

/** Keys we've already tried to migrate in this session — prevents re-work. */
const migrated = new Set<string>();

const lsRead = (name: string): string | null => {
  try {
    return localStorage.getItem(PREFIX + name);
  } catch {
    return null;
  }
};

const lsWrite = (name: string, value: string): void => {
  try {
    if (value) localStorage.setItem(PREFIX + name, value);
    else localStorage.removeItem(PREFIX + name);
  } catch {
    /* ignore */
  }
};

const lsClear = (name: string): void => {
  try {
    localStorage.removeItem(PREFIX + name);
  } catch {
    /* ignore */
  }
};

/**
 * If we're in Tauri and an old localStorage value exists for `name`,
 * move it into the keychain and clear the plaintext copy.
 * No-ops on every subsequent call for the same name.
 */
const migrateIfNeeded = async (name: string): Promise<void> => {
  if (!isTauri()) return;
  if (migrated.has(name)) return;
  migrated.add(name);
  const legacy = lsRead(name);
  if (!legacy) return;
  try {
    await invoke('secret_set', { name, value: legacy });
    lsClear(name);
  } catch (err) {
    console.warn('[typex ai] keychain migration failed:', err);
  }
};

export const setSecret = async (name: string, value: string): Promise<void> => {
  if (isTauri()) {
    try {
      await invoke('secret_set', { name, value });
      // Belt-and-braces: wipe any old plaintext copy.
      lsClear(name);
      migrated.add(name);
      return;
    } catch (err) {
      console.warn('[typex ai] keychain write failed, falling back to localStorage:', err);
    }
  }
  lsWrite(name, value);
};

export const getSecret = async (name: string): Promise<string | null> => {
  if (isTauri()) {
    await migrateIfNeeded(name);
    try {
      const v = await invoke<string | null>('secret_get', { name });
      return v ?? null;
    } catch (err) {
      console.warn('[typex ai] keychain read failed, falling back to localStorage:', err);
    }
  }
  return lsRead(name);
};

export const hasSecret = async (name: string): Promise<boolean> => {
  if (isTauri()) {
    await migrateIfNeeded(name);
    try {
      return await invoke<boolean>('secret_has', { name });
    } catch {
      /* fall through */
    }
  }
  const v = lsRead(name);
  return !!v && v.length > 0;
};

export const clearSecret = async (name: string): Promise<void> => {
  if (isTauri()) {
    try {
      await invoke('secret_delete', { name });
      migrated.add(name);
    } catch (err) {
      console.warn('[typex ai] keychain delete failed:', err);
    }
  }
  lsClear(name);
};
