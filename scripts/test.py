"""Run deterministic game tests with system Node or the local Playwright driver."""

from pathlib import Path
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
node = shutil.which("node")
if not node:
    local = root / ".tools/python/playwright/driver/node.exe"
    if local.exists():
        node = str(local)
if not node:
    print("Node.js 22 이상을 설치하거나 requirements-dev.txt를 .tools/python에 설치해 주세요.")
    sys.exit(1)
tests = sorted(str(path.relative_to(root)) for path in (root / "tests").glob("*.test.js"))
if not tests:
    print("게임 테스트 파일이 없습니다.")
    sys.exit(1)
result = subprocess.run([node, "--test", *tests], cwd=root)
sys.exit(result.returncode)
