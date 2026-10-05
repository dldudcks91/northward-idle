#!/usr/bin/env python3
"""Check this workspace's documents, constrained skill metadata and Codex config.

Requires Python 3.11+, with no third-party dependencies. This is a preparation
check, not a simulation test suite or a general-purpose YAML implementation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import tomllib
from pathlib import Path
from urllib.parse import unquote, urlsplit


REQUIRED = (
    "AGENTS.md",
    "README.md",
    ".codex/config.toml",
    ".gitignore",
    ".editorconfig",
    "docs/WORKSPACE_SETUP.md",
    "docs/PROJECT_STATUS.md",
    "docs/DECISIONS.md",
    "docs/design/GAME_DESIGN.md",
    "docs/design/DISCUSSION_LOG.md",
    "docs/design/UI_DIRECTION.md",
    "docs/engineering/ARCHITECTURE.md",
    "docs/engineering/VALIDATION.md",
    "docs/reference/README.md",
    "docs/reference/SNAPSHOT_PROVENANCE.json",
)
SKILLS = (
    "northward-design",
    "northward-simulation",
    "northward-ui",
    "northward-verify",
    "northward-art",
)
LINK = re.compile(r"(?<!!)\[[^\]\n]*\]\(([^)\n]+)\)")


def scalar(raw: str) -> str | bool:
    if raw.startswith('"'):
        value = json.loads(raw)
        if not isinstance(value, str):
            raise ValueError("quoted metadata must be a string")
        return value
    if raw in ("true", "false"):
        return raw == "true"
    if re.fullmatch(r"[a-z0-9-]+", raw):
        return raw
    raise ValueError("use a JSON-compatible double-quoted string or boolean")


def constrained_yaml(text: str) -> dict:
    """Parse only the flat or one-level mappings authored in this project."""
    result: dict = {}
    section: str | None = None
    for number, line in enumerate(text.splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        match = re.fullmatch(r"( {0}| {2})([a-z][a-z0-9_]*):(?: (.+))?", line)
        if not match:
            raise ValueError(f"line {number}: unsupported metadata syntax")
        indent, key, raw = match.groups()
        if indent:
            if section is None or raw is None:
                raise ValueError(f"line {number}: invalid section child")
            destination = result[section]
        else:
            destination = result
            section = None
        if key in destination:
            raise ValueError(f"line {number}: duplicate key {key}")
        if raw is None:
            if indent:
                raise ValueError(f"line {number}: nested sections not supported")
            destination[key] = {}
            section = key
        else:
            destination[key] = scalar(raw)
    return result


def prose_lines(text: str):
    marker = None
    length = 0
    for number, line in enumerate(text.splitlines(), 1):
        fence = re.match(r"^\s*(`{3,}|~{3,})(.*)$", line)
        if fence:
            token, tail = fence.groups()
            if marker is None:
                marker, length = token[0], len(token)
            elif token[0] == marker and len(token) >= length and not tail.strip():
                marker = None
            continue
        if marker is None:
            # Links in literal inline code aren't document navigation.
            yield number, re.sub(r"`+[^`]*`+", "", line)


def validate(root: Path) -> tuple[list[str], int, int]:
    problems: list[str] = []
    link_count = 0

    def fail(path: Path, message: str):
        problems.append(f"{path.relative_to(root).as_posix()}: {message}")

    def read(path: Path) -> str | None:
        try:
            value = path.read_text(encoding="utf-8")
            if value.startswith("\ufeff"):
                fail(path, "remove UTF-8 BOM")
            return value
        except (OSError, UnicodeError) as exc:
            fail(path, str(exc))
            return None

    for name in REQUIRED:
        if not (root / name).is_file():
            problems.append(f"missing required file: {name}")

    documents = sorted(
        {root / "README.md", root / "AGENTS.md"}
        | set((root / "docs").rglob("*.md"))
        | set((root / ".agents/skills").rglob("*.md"))
    )
    for path in documents:
        if not path.is_file():
            continue
        body = read(path)
        if body is None:
            continue
        for number, line in prose_lines(body):
            for match in LINK.finditer(line):
                raw = match.group(1).strip()
                target = raw[1:raw.index(">")].strip() if raw.startswith("<") else raw.split()[0]
                parts = urlsplit(target)
                if parts.scheme or parts.netloc or not parts.path:
                    continue
                link_count += 1
                resolved = (path.parent / unquote(parts.path)).resolve()
                if not resolved.is_relative_to(root):
                    fail(path, f"line {number}: local link leaves workspace: {target}")
                elif not resolved.exists():
                    fail(path, f"line {number}: missing link target: {target}")

    config_path = root / ".codex/config.toml"
    if config_path.is_file():
        try:
            config = tomllib.loads(config_path.read_text(encoding="utf-8"))
            if config.get("sandbox_mode") != "workspace-write":
                fail(config_path, "expected workspace-write sandbox")
            if config.get("approval_policy") != "on-request":
                fail(config_path, "expected on-request approval policy")
            if config.get("approvals_reviewer") != "auto_review":
                fail(config_path, "expected auto_review reviewer")
            if config.get("web_search") != "live":
                fail(config_path, "expected live documentation search")
            sandbox = config.get("sandbox_workspace_write", {})
            if sandbox.get("network_access") is not False:
                fail(config_path, "expected no blanket shell network grant")
            if sandbox.get("writable_roots"):
                fail(config_path, "unexpected additional writable roots")
            if "projects" in config:
                fail(config_path, "project trust belongs in user config")
        except (ValueError, OSError, UnicodeError) as exc:
            fail(config_path, str(exc))

    for name in SKILLS:
        skill = root / ".agents/skills" / name
        skill_path = skill / "SKILL.md"
        body = read(skill_path)
        if body is not None:
            match = re.match(r"\A---\n(.*?)\n---(?:\n|$)", body, re.S)
            if not match:
                fail(skill_path, "invalid YAML frontmatter delimiters")
            else:
                try:
                    metadata = constrained_yaml(match.group(1))
                    if set(metadata) != {"name", "description"}:
                        fail(skill_path, "frontmatter must contain name and description")
                    if metadata.get("name") != name:
                        fail(skill_path, "skill name must match directory")
                    description = metadata.get("description")
                    if not isinstance(description, str) or not (1 <= len(description) <= 1024):
                        fail(skill_path, "description must be 1–1024 characters")
                    elif "<" in description or ">" in description:
                        fail(skill_path, "description must not contain angle brackets")
                    if "[TODO:" in body:
                        fail(skill_path, "unfinished skill scaffold")
                except (ValueError, TypeError, KeyError) as exc:
                    fail(skill_path, str(exc))
        ui_path = skill / "agents/openai.yaml"
        ui_text = read(ui_path)
        if ui_text is not None:
            try:
                ui = constrained_yaml(ui_text)
                if set(ui) != {"interface", "policy"}:
                    fail(ui_path, "expected interface and policy mappings")
                interface = ui.get("interface", {})
                for key in ("display_name", "short_description", "default_prompt"):
                    if not isinstance(interface.get(key), str) or not interface[key].strip():
                        fail(ui_path, f"missing string field: {key}")
                short = interface.get("short_description", "")
                if not (25 <= len(short) <= 64):
                    fail(ui_path, "short_description must be 25–64 characters")
                if f"${name}" not in interface.get("default_prompt", ""):
                    fail(ui_path, "default_prompt must invoke this skill by name")
                if ui.get("policy", {}).get("allow_implicit_invocation") is not True:
                    fail(ui_path, "expected implicit invocation enabled")
            except (ValueError, TypeError, AttributeError) as exc:
                fail(ui_path, str(exc))

    reference_count = len(list((root / "docs/reference/melvoridle").glob("[0-9][0-9]_*.md")))
    if reference_count != 12:
        problems.append(f"expected 12 Melvor research snapshots, found {reference_count}")
    provenance_path = root / "docs/reference/SNAPSHOT_PROVENANCE.json"
    if provenance_path.is_file():
        try:
            provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
            entries = provenance["files"]
            filenames = [entry["file"] for entry in entries]
            if len(entries) != 12 or len(set(filenames)) != 12:
                fail(provenance_path, "expected 12 distinct provenance entries")
            for entry in entries:
                filename = entry["file"]
                if not re.fullmatch(r"[0-9]{2}_[a-z_]+\.md", filename):
                    fail(provenance_path, "invalid snapshot filename")
                    continue
                path = root / "docs/reference/melvoridle" / filename
                if not path.is_file():
                    fail(provenance_path, f"missing research snapshot: {filename}")
                elif hashlib.sha256(path.read_bytes()).hexdigest() != entry["snapshotSha256"]:
                    fail(provenance_path, f"snapshot content changed without updating provenance: {filename}")
        except (OSError, UnicodeError, ValueError, KeyError, TypeError) as exc:
            fail(provenance_path, f"invalid provenance: {exc}")
    return problems, len(documents), link_count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    root = parser.parse_args().root.resolve()
    if not root.is_dir():
        print(f"FAIL: workspace directory does not exist: {root}", file=sys.stderr)
        return 1
    problems, documents, links = validate(root)
    if problems:
        print("FAIL\n" + "\n".join(f"- {problem}" for problem in problems))
        return 1
    print(f"PASS: {documents} Markdown files, {links} local links, 5 skills, TOML config, 12 research snapshots")
    print("Scope: workspace preparation only; gameplay and runtime permissions are not tested.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
