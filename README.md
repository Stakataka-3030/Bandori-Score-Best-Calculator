# Bandori Score Best Calculator

一个用于 **BanG Dream! 少女乐团派对** 的桌面端队伍计算器，基于开源 HHWX 相关计算逻辑继续开发，重点是修正部分谱面的技能触发时序问题，并提供可直接使用的最优队伍搜索。

## 为什么做这个项目

我们在实际对比中发现，原有计算逻辑在部分谱面上会直接使用谱面中的标称技能触发时间，但游戏内技能实际上不能重叠：如果前一个技能仍在持续，后一个技能会被推迟到前一个技能结束后的 **0.75 秒**再触发。

实际触发时间按下面的规则递归计算：

```text
s₁ = t₁
sₖ = max(tₖ, sₖ₋₁ + dₖ₋₁ + 0.75)
```

其中 `t` 是谱面标称触发时间，`s` 是实际触发时间，`d` 是前一个技能的持续时间。

在技能间隔较短、技能持续时间较长的歌曲中，这个差异会继续向后传递，最终影响算分以及最优队伍搜索结果。本项目因此加入了实际技能时间线调度，并让搜索过程按修正后的触发时间计算。

## 主要功能

- 单曲最优队伍搜索，而不是只计算给定队伍的分数。
- Medley 三队最优搜索。
- 使用实际的技能顺序概率模型，并正确处理技能延迟与递归后移。
- 结果中可查看技能是否发生后移以及具体技能时间线。
- 自动从 Bestdori 同步最新卡牌、活动、歌曲与谱面数据，并缓存到本地。
- 支持导入 Bestdori / HHWX Profile JSON。
- 支持直接从系统剪贴板读取 HHWX 导出的 JSON。
- 默认搜索时间上限为 60 秒；可勾选 **“不限时，计算到最优为止”**，将上限提高到 1800 秒（30 分钟），如果提前证明最优则会立即结束。
- 提供 Windows x64、macOS Apple Silicon 和 Linux x64 桌面版本。

## 使用方法

从 [Releases](https://github.com/Stakataka-3030/Bandori-Score-Best-Calculator/releases) 下载对应系统版本，导入 Profile JSON（或直接从剪贴板读取 HHWX JSON），选择歌曲、难度和活动条件后即可搜索。

程序只读取用户主动提供的档案数据和公开游戏数据，不会登录游戏账号，也不会调用 HHWX 的私有用户数据接口、Bilibili / 游戏会话或其他非公开账号访问方式。

## 上游与许可

本项目部分代码来源于：

- HHWX: https://github.com/BluewaterAlnilamII/hhwx
- 原 HHWX 代码 Copyright (c) 2026 BluewaterAlnilamII
- HHWX 使用 GNU Affero General Public License v3.0 only

本仓库保留适用的 AGPL 许可与来源说明。更详细的第三方说明见 `NOTICE.md`。
