# 开发指南

本项目面向 Tauri 2 桌面端，React / TypeScript / Vite 提供界面，Rust 实现原生外壳与 Medley 搜索。架构和数据边界见 [architecture.md](architecture.md)。

## 环境与安装

- Node.js 22（与仓库 CI 一致）和 npm
- 原生构建需要 Rust / Cargo；根 `Cargo.toml` 当前声明 Rust 1.98、edition 2024，工具链必须满足该要求
- Tauri 的系统依赖请按目标系统安装，见 [官方 prerequisites](https://v2.tauri.app/start/prerequisites/)

在仓库根目录执行：

```sh
npm install
```

当前仓库未跟踪 npm/Cargo 锁文件，依赖解析结果可能随时间变化。不要在整理文档时顺手升级依赖或改写历史发布版本。

## 开发与构建

```sh
# 浏览器界面开发；Tauri 原生调用需在桌面应用中验证
npm run dev

# 生成图标并启动 Tauri 桌面开发模式
npm run tauri:dev

# 前端回归检查、类型检查与 Vite 构建
npm run build

# 生成图标并构建原生桌面包（需要对应平台依赖）
npm run tauri:build
```

浏览器预览不能代替原生 HTTP、剪贴板和 Medley 命令的桌面验证。原生编译与打包也不能代替算法回归测试。

## 测试

```sh
npm run typecheck
npm run test:shuffle
npm run test:scheduler

cargo test -p bandori-medley-model
cargo test -p bandori-medley-reference
cargo test -p bandori-medley-search
```

`npm run build` 包含两个 JavaScript 回归脚本、TypeScript 检查和前端构建，但不执行 Rust 测试。三个 Medley crate 的测试分别检查输入契约、参考算分、搜索及上下界；原生 Tauri 构建需要另行验证。

## 目录与版本

- `src/`：界面、数据同步、单曲搜索、Tauri 命令适配
- `src-tauri/`：桌面应用与原生命令
- `crates/`：Medley 模型、参考算分器和搜索器
- `scripts/`：回归检查、上游导入和历史迁移脚本；运行前查阅 [维护脚本索引](maintenance-scripts.md)
- `docs/`：架构、开发和维护说明

应用版本应在 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 中保持一致。内部 Medley crate 有独立的 `0.1.0` 版本，不应为了匹配应用版本机械修改。历史发布工作流中的固定版本属于对应发布记录。

本项目沿用现有 AGPL-3.0-only 许可声明。第三方来源与素材边界见 [NOTICE.md](../NOTICE.md)；整理目录不改变授权范围。
