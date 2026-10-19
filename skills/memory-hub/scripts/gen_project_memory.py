#!/usr/bin/env python3
"""
memory-hub · L2 项目记忆骨架生成器（零依赖 · 仅标准库）

在指定项目目录一键生成「防漂移记忆骨架」：
  AGENTS.md                          项目指令（存在则跳过）
  PROJECT_CONTEXT.md                 路线图级锚点（真相源）
  .dsh/memory/MEMORY.md              指针层（≤200 行，只存锚点）
  .dsh/memory/YYYY-MM-DD.md          当日滚动日志（append-only）
  SPECS/00-INDEX.md                  （可选）真相源索引

已存在的文件自动跳过，不覆盖。

用法：
  python3 gen_project_memory.py --project-path <dir> --project-name <名称> [--specs]
"""
import argparse
import sys
from datetime import date
from pathlib import Path

TODAY = date.today().isoformat()


def write(p: Path, content: str):
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists():
        print(f"⏭️  已存在跳过: {p}")
        return
    p.write_text(content, encoding="utf-8")
    print(f"✅ 生成: {p}")


def main():
    ap = argparse.ArgumentParser(description="memory-hub L2 项目记忆骨架生成器")
    ap.add_argument("--project-path", required=True, help="项目根目录（绝对或 ~/ 相对）")
    ap.add_argument("--project-name", required=True, help="项目名称")
    ap.add_argument("--specs", action="store_true", help="同时生成 SPECS/00-INDEX.md 真相源索引")
    args = ap.parse_args()

    base = Path(args.project_path).expanduser().resolve()
    base.mkdir(parents=True, exist_ok=True)
    name = args.project_name
    mem = base / ".dsh" / "memory"

    write(base / "AGENTS.md", f"""# {name} · 项目指令

> 本文件是项目级指令（DSH 每次会话自动注入）。只写稳定的约定与红线，不写进度。

## 启动清单（每次新会话）
1. 读本文件
2. 读 PROJECT_CONTEXT.md（阶段 / 决策 / 约束）
3. 读 .dsh/memory/MEMORY.md（锚点与指针）
4. 读 .dsh/memory/{TODAY}.md（当天日志）
5. 规则 vs 记忆分离核对：有没有已废规则仍被当铁律

## 约定
- 语言 / 风格：
- 目录约定：
- 禁止事项：

## 路由
- 路线图锚点：PROJECT_CONTEXT.md
- 记忆指针：.dsh/memory/MEMORY.md
""")

    write(base / "PROJECT_CONTEXT.md", f"""# {name} · 项目路线图锚点

> 单一事实源：本文件是项目级锚点，与 MEMORY.md（指针层）和每日日志分离。
> 冲突以本文件 + SPECS/ 为准。

## 项目定位
（一句话说清这是什么、为谁、差异化在哪）

## 当前阶段 / 状态
- 阶段：
- 下一步：
- 待办：

## 关键决策（decision:）
- decision: （关键不可逆决策，含日期与理由）

## 约束（constraint:）
- constraint: （硬约束，如合规 / 技术红线）

## 开放问题（open_question:）
- open_question:

## 路由
- 记忆指针：`.dsh/memory/MEMORY.md`
- 当日日志：`.dsh/memory/{TODAY}.md`
""")

    write(mem / "MEMORY.md", f"""# {name} · 项目记忆指针层（≤200 行）

> 只存锚点与指针，不存正文。正文在 PROJECT_CONTEXT.md 与每日日志。
> 超 200 行 / 4000 字符会被注入截断 → 锚点精简、细节外置。

## 当前锚点
- 阶段：
- 下一步：
- 最近决策：

## 结构化键索引
- decision: （见 PROJECT_CONTEXT）
- constraint: （见 PROJECT_CONTEXT）
- open_question: （见 PROJECT_CONTEXT）

## 文件索引
- AGENTS.md：项目指令与启动清单
- PROJECT_CONTEXT.md：路线图级锚点（真相源）
- YYYY-MM-DD.md：每日滚动日志（append-only）
""")

    write(mem / f"{TODAY}.md", f"""# {TODAY} {name} 日志

（append-only 滚动日志：每次实质性工作后追加，不覆盖。）
""")

    if args.specs:
        write(base / "SPECS" / "00-INDEX.md", """# SPECS 真相源索引

> 所有设计规格在此登记，冲突以本索引指向的文件为准（single source of truth）。

| 编号 | 文件 | 主题 | 状态 |
|---|---|---|---|
| SPEC-001 | SPECS/001-<topic>.md | （主题） | draft |
""")

    print(f"\n🎉 {name} 记忆骨架已生成于 {base}")
    print("下一步：填 PROJECT_CONTEXT.md 占位 → 记日志用 append → 跑 mem_health_scan.py 做健康检查。")
    sys.exit(0)


if __name__ == "__main__":
    main()
