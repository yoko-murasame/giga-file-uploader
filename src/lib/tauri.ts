/**
 * Tauri IPC 统一入口
 *
 * 所有组件通过此文件调用 Tauri IPC，不直接使用 @tauri-apps/api。
 * Store actions 通过此文件中的封装函数调用 Tauri commands。
 * 事件监听通过自定义 hooks 使用 listen 函数。
 */

export { invoke } from '@tauri-apps/api/core';
export { listen } from '@tauri-apps/api/event';

// TODO: 后续 Story 添加具体 command 封装函数
// 例如:
// export async function startUpload(files: FileInput[], config: UploadConfig) { ... }
// export async function cancelUpload(taskId: string) { ... }
// export async function getHistory() { ... }
