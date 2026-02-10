/**
 * Tauri IPC 统一入口
 *
 * 所有组件通过此文件调用 Tauri IPC，不直接使用 @tauri-apps/api。
 * Store actions 通过此文件中的封装函数调用 Tauri commands。
 * 事件监听通过自定义 hooks 使用 listen 函数。
 */

import { invoke } from '@tauri-apps/api/core';

export { invoke } from '@tauri-apps/api/core';
export { listen } from '@tauri-apps/api/event';

import type { FileEntry } from '@/types/upload';

/** Resolve dropped file/directory paths into a flat list of file entries. */
export async function resolveDroppedPaths(
  paths: string[],
): Promise<FileEntry[]> {
  return invoke<FileEntry[]>('resolve_dropped_paths', { paths });
}

