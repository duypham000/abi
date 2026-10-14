# Tomo UI

Desktop app cho Tomo, xây dựng bằng **Tauri v2** + **React 19** + **TypeScript**. Kết nối với backend `tomo/base`.

## Yêu cầu

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)
- [Rust + Cargo](https://rustup.rs/) (cho Tauri)
- Backend `tomo/base` đang chạy trên `localhost:8080`

## Cài đặt

```bash
pnpm install
```

## Chạy development

```bash
pnpm tauri dev
```

Vite dev server khởi động trên `http://localhost:1420`, sau đó Tauri compile Rust và mở cửa sổ desktop.

> Lần đầu chạy sẽ mất vài phút do compile ~476 Rust crates.

## Build production

### 1. Build Windows (EXE)

```bash
pnpm tauri build
```

Tệp cài đặt `.exe` (NSIS) sẽ được xuất ra tại thư mục: `src-tauri/target/release/bundle/nsis/`.

### 2. Build Android (APK)

```bash
pnpm tauri android build --apk --split-per-abi --target aarch64
```

Tệp `.apk` sau khi hoàn thành sẽ nằm tại thư mục:
`src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk`.

### 3. Cập nhật và Đồng bộ App Icons

Khi thay đổi hoặc cập nhật icon mới (ở tệp tin `src-tauri/icons/icon.png`), bạn cần đồng bộ lại icon cho tất cả các nền tảng trước khi tiến hành build:

```bash
pnpm tauri icon src-tauri/icons/icon.png
```

## Release (CI/CD)

Mỗi khi push một git tag dạng `v*` (vd `v0.1.0`), GitHub Actions
([`.github/workflows/release.yaml`](.github/workflows/release.yaml)) tự động build và
đính kèm artifact vào một **GitHub Release** tương ứng:

| Nền tảng | Runner | Output |
|---|---|---|
| Windows | `windows-latest` | Installer `.exe` (NSIS) + `.msi` |
| Android | `ubuntu-latest` | APK **debug-signed** (cài được để test) |

```bash
git tag v0.1.0
git push origin v0.1.0
```

> APK hiện là bản debug-signed (dùng để test). Windows installer chưa code-signing nên
> SmartScreen có thể cảnh báo khi cài. Xem nhánh nâng cấp trong workflow để chuyển sang
> release keystore / certificate thật.

## Cấu trúc project

```
src/
├── core/interfaces/        # TypeScript contracts
├── infrastructure/
│   ├── api/                # RTK Query (auth + base API)
│   ├── services/           # Runtime detection Tauri vs Web
│   ├── tauri/              # Tauri file service (invoke Rust commands)
│   └── web/                # Web fallback (localStorage)
└── presentation/
    ├── components/         # ProtectedRoute
    ├── features/
    │   ├── auth/           # Login, Register
    │   └── dashboard/      # Dashboard, Sidebar
    └── store/              # Redux — authSlice, appSlice
```

## Biến môi trường

| Biến | Mặc định | Mô tả |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8080/api/v1` | URL backend API |

## IDE khuyến nghị

[VS Code](https://code.visualstudio.com/) với các extension:
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
