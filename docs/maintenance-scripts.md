# 维护脚本与历史补丁索引

常规开发和测试从 [开发指南](development.md) 开始。以下脚本分为持续使用的工具和历史迁移工具，不能将所有 `apply-*` / `patch-*` 文件一概视为可删除的旧文件。

## 持续使用的入口

- `scripts/verify-skill-shuffle.mjs`：`npm run test:shuffle`，也是 `npm run build` 的一部分
- `scripts/verify-skill-trigger-scheduler.mjs`：`npm run test:scheduler`，也是 `npm run build` 的一部分
- `scripts/vendor-hhwx.mjs`：`npm run vendor:hhwx` 与 `vendor:hhwx:check` 使用的固定上游导入工具；运行写入模式会覆盖目标源码
- `scripts/vendor-hhwx-medley.mjs`：Medley 上游导入工具；来源记录见 [hhwx-medley-upstream.json](hhwx-medley-upstream.json)

`.github/workflows/vendor-hhwx.yml` 导入上游后会依次调用 `apply-real-skill-shuffle.mjs` 与 `apply-skill-trigger-delay-patch.mjs`。这两个补丁仍属于重新导入链，不能单独删除或移动。

## 历史迁移脚本与现存工作流

下列脚本仍被 `.github/workflows/` 中的工作流直接引用。此索引记录它们的用途，不表示当前代码仍需要重跑补丁。部分补丁依赖特定旧源码形状，重复执行可能失败或覆盖修改。

| 工作流 | 脚本（路径均相对 `scripts/`） |
| --- | --- |
| `apply-clipboard-import.yml` | `apply-clipboard-import-patch.mjs` |
| `apply-issue-1-event-songs.yml` | `apply-issue-1-event-songs.mjs` |
| `apply-search-until-optimal.yml` | `apply-search-until-optimal-option.mjs` |
| `apply-medley-ui.yml` | `patch-medley-ui.mjs` |
| `apply-skill-trigger-delay.yml` | `apply-skill-trigger-delay-patch.mjs`, `apply-scheduler-diagnostics-patch.mjs` |
| `fix-scheduler-same-time-boundary.yml` | `fix-scheduled-same-time-boundary.mjs`（还会更新重新导入所用的延迟补丁） |
| `apply-medley-real-shuffle.yml` | `apply-medley-real-skill-shuffle-patch.mjs`, `patch-medley-reference-shuffle.mjs`, `patch-medley-fast-upper-shuffle.mjs`, `patch-medley-upper-rounding.mjs`, `patch-medley-hydration-shuffle.mjs`, `patch-medley-search-layout.mjs`, `patch-medley-exact-tests.mjs`, `patch-medley-tiny-oracle-layouts.mjs` |
| `apply-medley-trigger-delay.yml` | `patch-medley-trigger-delay-reference.mjs`, `patch-medley-trigger-delay-exact.mjs`, `patch-medley-trigger-delay-cache.mjs`, `patch-medley-trigger-delay-upper.mjs`, `patch-medley-trigger-delay-tests.mjs`, `patch-medley-trigger-delay-tiny-fixture.mjs` |

这些迁移与导入工作流中有自动提交并推送 `main` 的步骤，而且部分会在工作流自身或关联脚本发生变化时自动触发。修改前应同时检查触发条件、写权限和引用链；不要为了验证目录整理而运行写入型迁移。

## 已归档工具

`scripts/archive/inline-dist.mjs` 是旧单 HTML 打包工具。归档前已检查当前受版本控制的代码、文档、npm scripts 和工作流，没有其调用引用；当前架构也不以单 HTML 分发为目标。文件原样保留以便追溯，未接入现有构建。详见 [归档说明](../scripts/archive/README.md)。

## 发布工作流边界

`release-v0.1.3.yml` 和 `release-v0.1.4.yml` 固定对应各自发布版本，包含创建/更新 Release 及覆盖附件的步骤。修改这些文件可能触发发布，不应将其当作普通过期文档重命名或重跑。本次目录说明不改变任何发布、补丁或上游导入工作流。
