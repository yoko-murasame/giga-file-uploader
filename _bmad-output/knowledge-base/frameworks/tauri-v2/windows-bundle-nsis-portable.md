# Tauri 2 Windows Bundle Configuration: NSIS + Portable

**Framework:** Tauri 2.x
**Topic:** Windows bundle targets (NSIS installer + portable exe), WebView2 installMode
**Confidence:** HIGH
**Sources:** Context7 /tauri-apps/tauri-docs (official docs)
**Researched:** 2026-02-12

---

## 1. Bundle Targets for Windows

In `tauri.conf.json`, the `bundle.targets` field controls which installer formats are produced.

### Valid Windows targets

| Target | Output | Description |
|--------|--------|-------------|
| `"nsis"` | `{productName}_{version}_x64-setup.exe` | NSIS-based installer with install/uninstall, start menu, WebView2 bootstrapping |
| `"msi"` | `{productName}_{version}_x64_en-US.msi` | Windows Installer (WiX-based) |
| `"all"` | Both NSIS + MSI (all platform formats) | Produces every format for the current OS |

**Important:** There is NO separate `"portable"` target in Tauri 2. To produce a portable exe, you must use the NSIS installer with a specific configuration (see Section 3 below) or distribute the raw exe from the build output.

### Producing both NSIS installer and portable-like output

```json
{
  "bundle": {
    "targets": ["nsis"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

To produce multiple formats explicitly:

```json
{
  "bundle": {
    "targets": ["nsis", "msi"]
  }
}
```

Or use `"all"` to build every format supported on the current platform:

```json
{
  "bundle": {
    "targets": "all"
  }
}
```

## 2. WebView2 installMode Configuration

The `bundle.windows.webviewInstallMode` controls how WebView2 runtime is provisioned during installation.

### Option A: downloadBootstrapper (default)

Downloads and runs the WebView2 bootstrapper at install time. Smallest installer size but requires internet.

```json
{
  "bundle": {
    "windows": {
      "webviewInstallMode": {
        "type": "downloadBootstrapper"
      }
    }
  }
}
```

### Option B: embedBootstrapper

Embeds the WebView2 bootstrapper directly in the installer (~1.8MB added). Still requires internet for the actual runtime download but more reliable on older Windows.

```json
{
  "bundle": {
    "windows": {
      "webviewInstallMode": {
        "type": "embedBootstrapper"
      }
    }
  }
}
```

### Option C: offlineInstaller

Embeds the entire WebView2 runtime (~150MB+). No internet required. Use for air-gapped environments.

```json
{
  "bundle": {
    "windows": {
      "webviewInstallMode": {
        "type": "offlineInstaller",
        "path": "./webview2-offline-installer.exe"
      }
    }
  }
}
```

### Option D: skip

Skips WebView2 installation entirely. Use only when you are certain the target system already has WebView2 (e.g., Windows 11 where it comes preinstalled, or Win10 1803+ with system WebView2).

```json
{
  "bundle": {
    "windows": {
      "webviewInstallMode": {
        "type": "skip"
      }
    }
  }
}
```

## 3. NSIS Section Configuration Keys

Full `bundle.windows.nsis` configuration options:

```json
{
  "bundle": {
    "windows": {
      "nsis": {
        "displayLanguageSelector": true,
        "languages": ["English", "Japanese", "SimpChinese"],
        "minimumWebview2Version": "110.0.1531.0",
        "installerIcon": "icons/icon.ico",
        "headerImage": "icons/nsis-header.bmp",
        "sidebarImage": "icons/nsis-sidebar.bmp",
        "installMode": "currentUser"
      }
    }
  }
}
```

### Key fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `installMode` | `string` | `"currentUser"` | `"currentUser"`, `"perMachine"`, or `"both"` (shows selector) |
| `languages` | `string[]` | `null` | NSIS language identifiers for the installer UI |
| `displayLanguageSelector` | `bool` | `false` | Show language picker dialog before install |
| `minimumWebview2Version` | `string` | `null` | Minimum WebView2 version; installer updates if below |
| `installerIcon` | `string` | `null` | Path to .ico for installer executable icon |
| `headerImage` | `string` | `null` | BMP image for NSIS header (150x57) |
| `sidebarImage` | `string` | `null` | BMP image for NSIS sidebar (164x314) |

## 4. Recommended Configuration for This Project

Given the project targets (NSIS setup.exe + portable-friendly, Win10 1803+ baseline):

```json
{
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "webviewInstallMode": {
        "type": "downloadBootstrapper"
      },
      "nsis": {
        "displayLanguageSelector": false,
        "languages": ["SimpChinese", "Japanese", "English"],
        "minimumWebview2Version": "110.0.1531.0",
        "installMode": "currentUser"
      }
    }
  }
}
```

**Notes:**
- `downloadBootstrapper` is the default and recommended for most cases — keeps installer small
- `minimumWebview2Version` ensures the installed WebView2 meets Tauri 2's requirements
- Windows 11 ships with WebView2 preinstalled; Windows 10 1803+ can have it installed via the bootstrapper
- For portable distribution: the raw `.exe` from `src-tauri/target/release/` can be distributed directly, but it will NOT include WebView2 bootstrapping — users must have WebView2 pre-installed (guaranteed on Win11, likely on updated Win10)

## 5. Platform-Specific Notes

- **Windows 7:** Not recommended. If needed, use `embedBootstrapper` and enable TLS 1.2
- **Windows 10 1803+:** `downloadBootstrapper` works reliably. System WebView2 may already be present via Windows Update
- **Windows 11:** WebView2 is always present. `skip` mode is safe if targeting Win11-only
