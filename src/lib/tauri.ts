/**
 * Tauri IPC 统一入口
 *
 * 所有组件通过此文件调用 Tauri IPC，不直接使用 @tauri-apps/api。
 * Store actions 通过此文件中的封装函数调用 Tauri commands。
 * 事件监听通过自定义 hooks 使用 listen 函数。
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

export { invoke } from '@tauri-apps/api/core';
export { listen } from '@tauri-apps/api/event';

import type { FileEntry } from '@/types/upload';
import type { HistoryRecord } from '@/types/history';
import type { AppSettings } from '@/types/settings';

/** Resolve dropped file/directory paths into a flat list of file entries. */
export async function resolveDroppedPaths(paths: string[]): Promise<FileEntry[]> {
  return invoke<FileEntry[]>('resolve_dropped_paths', { paths });
}

/** Open the system native file picker dialog. Returns selected file paths, or null if cancelled. */
export async function openFilePicker(): Promise<string[] | null> {
  const selected = await open({ multiple: true });
  if (selected === null) return null;
  return Array.isArray(selected) ? selected : [selected];
}

/** Start uploading files. Returns task IDs for each file. */
export async function startUpload(
  files: FileEntry[],
  config: { lifetime: number }
): Promise<string[]> {
  return invoke<string[]>('start_upload', { files, config });
}

/** Cancel an active upload task. */
export async function cancelUpload(taskId: string): Promise<void> {
  return invoke<void>('cancel_upload', { taskId });
}

/** Get all upload history records. */
export async function getHistory(): Promise<HistoryRecord[]> {
  return invoke<HistoryRecord[]>('get_history');
}

/** Delete a history record by ID. */
export async function deleteHistory(id: string): Promise<void> {
  return invoke<void>('delete_history', { id });
}

/** Copy text to system clipboard. */
export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/** Get application settings. Returns defaults if no settings saved. */
export async function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>('get_settings');
}

/** Save application settings. */
export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke<void>('save_settings', { settingsData: settings });
}

/** Check if gigafile.nu is reachable. Returns true if online, false if offline. */
export async function checkNetwork(): Promise<boolean> {
  return invoke<boolean>('check_network');
}
