#!/usr/bin/env python3
"""Check a skill folder against the Agent Skills specification's stated rules.

Usage: python3 scripts/check-skill.py skills/flagsmith-experiment
(https://agentskills.io/specification: name, description, compatibility,
metadata, SKILL.md length, and that referenced files exist.)
"""
import os
import re
import sys

folder = sys.argv[1].rstrip("/")
text = open(os.path.join(folder, "SKILL.md"), encoding="utf-8").read()
match = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
problems = []
if not match:
    sys.exit("SKILL.md has no YAML frontmatter")
front, body = match.groups()

fields = {}
for line in front.split("\n"):
    m = re.match(r"^([a-z-]+):\s*(.*)$", line)
    if m:
        fields[m.group(1)] = m.group(2).strip()

name = fields.get("name", "")
if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", name) or len(name) > 64:
    problems.append("name must be 1-64 characters of a-z, 0-9 and single hyphens")
if name != os.path.basename(folder):
    problems.append(f"name '{name}' must match the folder name '{os.path.basename(folder)}'")
description = fields.get("description", "")
if not 1 <= len(description) <= 1024:
    problems.append("description must be 1-1024 characters")
if len(fields.get("compatibility", "")) > 500:
    problems.append("compatibility must be at most 500 characters")
lines = text.count("\n") + 1
if lines > 500:
    problems.append(f"SKILL.md has {lines} lines; keep it under 500")
for ref in re.findall(r"\]\(([^)#]+)\)", body) + re.findall(r"`(scripts/[\w./-]+)`", body):
    if not ref.startswith("http") and not os.path.exists(os.path.join(folder, ref)):
        problems.append(f"referenced file does not exist: {ref}")

print(f"name: {name}")
print(f"description: {len(description)} characters")
print(f"SKILL.md: {lines} lines, {len(text)} characters (about {round(len(text) / 4)} tokens)")
print("OK" if not problems else "PROBLEMS:\n- " + "\n- ".join(problems))
sys.exit(1 if problems else 0)
