#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path

from release_audit import RELEASE_FILES, audit_source, audit_zip

FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)


def build_release(root: Path, output: Path) -> None:
    errors, warnings = audit_source(root)
    for warning in warnings:
        print(f"WARN {warning}")
    if errors:
        for error in errors:
            print(f"FAIL {error}")
        raise SystemExit(1)

    output.parent.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    if "{version}" in str(output):
        output = Path(str(output).replace("{version}", version))

    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for relative in RELEASE_FILES:
            data = (root / relative).read_bytes()
            info = zipfile.ZipInfo(relative, FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            info.create_system = 3
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

    zip_errors, zip_warnings = audit_zip(output, root)
    for warning in zip_warnings:
        print(f"WARN {warning}")
    if zip_errors:
        for error in zip_errors:
            print(f"FAIL {error}")
        output.unlink(missing_ok=True)
        raise SystemExit(1)

    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    checksum_path = output.with_suffix(output.suffix + ".sha256")
    checksum_path.write_text(f"{digest}  {output.name}\n", encoding="ascii")
    print(f"PASS built {output}")
    print(f"SHA256 {digest}  {output.name}")
    print(f"PASS wrote {checksum_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build deterministic Chrome Web Store ZIP")
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("dist/liked-media-masonry-v{version}.zip"),
    )
    args = parser.parse_args()
    root = args.source.resolve()
    output = args.output
    if not output.is_absolute():
        output = root / output
    build_release(root, output)
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    raise SystemExit(main())
