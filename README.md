# Giga File Uploader

A cross-platform desktop client for uploading files to [gigafile.nu](https://gigafile.nu/), built with Tauri 2, React, and Rust.

## Features

- **Drag & Drop Upload** - Simply drag files into the app and start uploading
- **Auto Retry** - Automatic retry on network failures (up to 50 retries, silent below 50)
- **Real-time Progress** - Live upload progress with per-file and per-shard tracking
- **Download Links** - Get shareable links instantly after upload completes
- **Clean UI** - No ads, no distractions, just upload
- **Cross-platform** - Supports macOS (Apple Silicon) and Windows 10/11

## Screenshots

<!-- Add screenshots here -->

## Installation

### macOS

Download the `.dmg` file from [Releases](../../releases), or use the portable `.app` bundle.

### Windows

Two options available:
- **NSIS Installer** (`*-setup.exe`) - Recommended, auto-installs WebView2 if missing
- **Portable** (`Giga File Uploader.exe`) - No installation required, requires WebView2 runtime (Win10 1803+ / Win11 pre-installed)

> **Note:** Portable exe is available in the release assets. It's the raw executable that can run directly without installation.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- [Rust](https://www.rust-lang.org/) stable
- [Tauri CLI](https://v2.tauri.app/start/) v2

### Getting Started

```bash
# Clone the repository
git clone https://github.com/yoko-murasame/giga-file-uploader.git
cd giga-file-uploader

# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

### Project Structure

```
giga-file-uploader/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── hooks/              # React hooks
│   ├── stores/             # Zustand state stores
│   ├── lib/                # Tauri IPC wrappers
│   └── types/              # TypeScript types
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── commands/       # Tauri IPC handlers
│   │   ├── services/       # Business logic
│   │   ├── api/            # gigafile.nu API client
│   │   ├── models/         # Data structures
│   │   └── storage/        # Local persistence
│   └── tauri.conf.json     # Tauri configuration
└── .github/workflows/      # CI/CD pipelines
```

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS 4, Zustand, Radix UI, Framer Motion
- **Backend:** Rust, Tauri 2, Tokio, Reqwest
- **Build:** Vite, pnpm, GitHub Actions

## Disclaimer

This project is an unofficial client for gigafile.nu. It is not affiliated with or endorsed by gigafile.nu. Use at your own risk.

The project relies on reverse-engineered APIs and may break if gigafile.nu changes their service.

## License

[MIT License](LICENSE)

## Author

**Shaoyoko**

- GitHub: [@yoko-murasame](https://github.com/yoko-murasame)
