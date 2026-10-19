#!/usr/bin/env python3
"""
memory-hub · L1 记忆健康扫描（零依赖 · 仅标准库）

对 MEMORY.md 做四件事：
  ① 规模体检：行数 / 字符是否越过注入截断阈值（默认 200 行 / 4000 字符）。
  ② 矛盾漂移：已废 / 已推翻的规则仍被当 active 铁律守护（最危险漂移）。
  ③ 明文凭据：API key / token / password / PAT / 私钥 等是否落进记忆文件。
  ④ 重复结构化键：decision:/constraint:/open_question: 是否重复定义。

用法：
  python3 mem_health_scan.py [--path MEMORY.md] [--limit-chars 4000] [--limit-lines 200]
默认扫描 ~/.dsh/memory/MEMORY.md；用 --path 指向其他文件。
退出码：0 = 扫描完成（告警在 stdout）；2 = 文件不存在。
"""
import argparse
import re
import sys
from pathlib import Path

# 默认指向 DSH 用户级记忆索引；可用 --path 覆盖。
DEFAULT_PATH = Path.home() / ".dsh" / "memory" / "MEMORY.md"

CRED_PATTERNS = [
    re.compile(r'(?i)(api[_-]?key|secret|token|password|passwd|pat|private[_-]?key)\s*[=:]\s*["\']?[A-Za-z0-9_\-]{12,}'),
    re.compile(r'sk-[A-Za-z0-9]{20,}'),           # OpenAI 类
    re.compile(r'ghp_[A-Za-z0-9]{20,}'),           # GitHub PAT
    re.compile(r'xox[baprs]-[A-Za-z0-9-]{10,}'),   # Slack
    re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
]
CONTRADICTION_MARKERS = ['已废除', '已推翻', '已弃用', '已作废', 'deprecated', 'obsolete', '已冻', '不再适用', '作废']
ACTIVE_MARKERS = ['铁律', '必须', '永远', '绝不', 'p0', 'pin', 'hard rule', 'must', 'never', '永不']


def scan(text):
    lines = text.splitlines()
    n_lines = len(lines)
    n_chars = len(text)

    contradictions = []
    for i, l in enumerate(lines, 1):
        low = l.lower()
        if any(m in l for m in CONTRADICTION_MARKERS) and any(m in low for m in ACTIVE_MARKERS):
            contradictions.append((i, l.strip()))

    creds = []
    for i, l in enumerate(lines, 1):
        for p in CRED_PATTERNS:
            if p.search(l):
                creds.append((i, l.strip()[:60]))
                break

    decision_keys = [l.strip() for l in lines if re.match(r'^\s*(decision|constraint|open_question)\s*:', l, re.I)]
    seen = {}
    for k in decision_keys:
        seen[k] = seen.get(k, 0) + 1
    dup = {k: c for k, c in seen.items() if c > 1}

    return {
        "n_lines": n_lines, "n_chars": n_chars,
        "contradictions": contradictions, "creds": creds,
        "decision_keys": decision_keys, "dup": dup,
    }


def main():
    ap = argparse.ArgumentParser(description="memory-hub L1 记忆健康扫描")
    ap.add_argument("--path", default=str(DEFAULT_PATH), help="MEMORY.md 路径（默认 ~/.dsh/memory/MEMORY.md）")
    ap.add_argument("--limit-chars", type=int, default=4000, help="字符阈值（默认 4000）")
    ap.add_argument("--limit-lines", type=int, default=200, help="行数阈值（默认 200）")
    args = ap.parse_args()

    p = Path(args.path).expanduser()
    if not p.exists():
        print(f"❌ 文件不存在: {p}")
        sys.exit(2)

    text = p.read_text(encoding="utf-8", errors="replace")
    r = scan(text)

    print(f"📄 {p}")
    print(f"   行数={r['n_lines']} (阈值 {args.limit_lines}) | 字符={r['n_chars']} (阈值 {args.limit_chars})")

    score = 0
    if r["n_lines"] > args.limit_lines:
        print(f"⚠️ 规模超限：行数 {r['n_lines']} > {args.limit_lines}，后半段可能被注入截断 → 锚点精简 / 外置指针")
        score += 1
    if r["n_chars"] > args.limit_chars:
        print(f"⚠️ 字符超限：{r['n_chars']} > {args.limit_chars}")
        score += 1
    if r["creds"]:
        print(f"🔴 明文凭据风险（{len(r['creds'])} 处）→ 立即迁钥匙串（见 agent-credential-hygiene）：")
        for i, l in r["creds"]:
            print(f"   L{i}: {l}")
        score += 2
    if r["contradictions"]:
        print(f"🟠 矛盾漂移（已废规则仍当 active，{len(r['contradictions'])} 处）→ 规则 vs 记忆分离核对：")
        for i, l in r["contradictions"]:
            print(f"   L{i}: {l}")
        score += 1
    if r["dup"]:
        print(f"🟡 重复结构化键：{', '.join(sorted(r['dup']))} → 合并为单一权威定义")

    if score == 0:
        print("✅ 健康：无规模 / 矛盾 / 凭据风险")
    else:
        print(f"\n⚠️ 健康告警项={score}（越大越危险）；修复见上方建议。")
    sys.exit(0)


if __name__ == "__main__":
    main()
