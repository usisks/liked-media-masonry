#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import zipfile
from pathlib import Path

from release_audit import (
    COMMON_RELEASE_FILES,
    MANIFEST_SOURCES,
    audit_archive,
    audit_source,
)

FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)


def safe_clean_directory(path: Path, allowed_parent: Path) -> None:
    resolved = path.resolve()
    parent = allowed_parent.resolve()
    if resolved.parent != parent:
        raise ValueError(f"refusing to clean output outside {parent}: {resolved}")
    if resolved.exists():
        shutil.rmtree(resolved)
    resolved.mkdir(parents=True)


def write_archive(source_dir: Path, output: Path) -> str:
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(source_dir.rglob("*")):
            if not path.is_file():
                continue
            relative = path.relative_to(source_dir).as_posix()
            info = zipfile.ZipInfo(relative, FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            info.create_system = 3
            archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(output.suffix + ".sha256").write_text(
        f"{digest}  {output.name}\n",
        encoding="ascii",
    )
    return digest


def build_browser(root: Path, dist: Path, browser: str) -> Path:
    manifest_path = root / MANIFEST_SOURCES[browser]
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    version = manifest["version"]
    tree = dist / browser
    safe_clean_directory(tree, dist)
    for relative in COMMON_RELEASE_FILES:
        source = root / relative
        destination = tree / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    shutil.copyfile(manifest_path, tree / "manifest.json")

    if browser == "chrome":
        archive_name = f"liked-media-masonry-chrome-v{version}.zip"
    else:
        archive_name = f"liked-media-masonry-firefox-floorp-v{version}-unsigned.xpi"
    archive_path = dist / archive_name
    digest = write_archive(tree, archive_path)
    archive_errors, archive_warnings = audit_archive(archive_path, manifest)
    for warning in archive_warnings:
        print(f"WARN {warning}")
    if archive_errors:
        for error in archive_errors:
            print(f"FAIL {error}")
        archive_path.unlink(missing_ok=True)
        raise SystemExit(1)
    print(f"PASS built {tree}")
    print(f"PASS built {archive_path}")
    print(f"SHA256 {digest}  {archive_path.name}")
    return archive_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Build deterministic Chrome and Firefox packages")
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--dist", type=Path, default=Path("dist"))
    parser.add_argument("--browser", choices=("all", "chrome", "firefox"), default="all")
    args = parser.parse_args()
    root = args.source.resolve()
    dist = args.dist if args.dist.is_absolute() else root / args.dist
    dist.mkdir(parents=True, exist_ok=True)

    errors, warnings = audit_source(root)
    for warning in warnings:
        print(f"WARN {warning}")
    if errors:
        for error in errors:
            print(f"FAIL {error}")
        return 1

    browsers = ("chrome", "firefox") if args.browser == "all" else (args.browser,)
    for browser in browsers:
        build_browser(root, dist, browser)
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    raise SystemExit(main())
