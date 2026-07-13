#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path
from urllib.parse import urlparse

from release_audit import FIREFOX_MIN_VERSION, GECKO_ID, SIGNATURE_MEMBERS, UPDATE_URL


def version_key(version: str) -> tuple[int, ...]:
    if not re.fullmatch(r"\d+(?:\.\d+)*", version):
        raise ValueError(f"unsupported Firefox update version: {version}")
    return tuple(int(part) for part in version.split("."))


def load_xpi(xpi: Path, require_signed: bool) -> tuple[dict, str]:
    digest = hashlib.sha256(xpi.read_bytes()).hexdigest()
    with zipfile.ZipFile(xpi) as archive:
        members = set(archive.namelist())
        if require_signed and not (members & SIGNATURE_MEMBERS):
            raise ValueError("XPI has no recognizable Mozilla signature metadata")
        manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
    return manifest, digest


def validate_manifest(manifest: dict) -> tuple[str, str]:
    version = str(manifest.get("version") or "")
    version_key(version)
    gecko = manifest.get("browser_specific_settings", {}).get("gecko", {})
    if gecko.get("id") != GECKO_ID:
        raise ValueError("XPI Gecko ID does not match the stable project ID")
    if gecko.get("strict_min_version") != FIREFOX_MIN_VERSION:
        raise ValueError("XPI strict_min_version differs from the project policy")
    if gecko.get("update_url") != UPDATE_URL:
        raise ValueError("XPI update_url differs from the stable Pages URL")
    return version, gecko["strict_min_version"]


def load_updates(path: Path) -> dict:
    if not path.exists():
        return {"addons": {GECKO_ID: {"updates": []}}}
    data = json.loads(path.read_text(encoding="utf-8"))
    if set(data) != {"addons"} or not isinstance(data["addons"], dict):
        raise ValueError("update manifest top level must contain only the addons object")
    if set(data["addons"]) != {GECKO_ID}:
        raise ValueError("update manifest addons key does not match the stable Gecko ID")
    updates = data["addons"][GECKO_ID].get("updates")
    if not isinstance(updates, list):
        raise ValueError("update manifest updates must be an array")
    versions = [str(entry.get("version") or "") for entry in updates]
    if len(versions) != len(set(versions)):
        raise ValueError("update manifest contains duplicate versions")
    return data


def build_entry(version: str, link: str, digest: str, strict_min_version: str) -> dict:
    parsed = urlparse(link)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError("update_link must be an absolute HTTPS URL")
    if "/releases/download/" not in parsed.path or "/latest/download/" in parsed.path:
        raise ValueError("update_link must use an immutable versioned GitHub Release URL")
    return {
        "version": version,
        "update_link": link,
        "update_hash": f"sha256:{digest}",
        "applications": {
            "gecko": {
                "strict_min_version": strict_min_version,
            }
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Append a signed XPI to Firefox updates.json")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--xpi", type=Path, required=True)
    parser.add_argument("--update-link", required=True)
    parser.add_argument("--require-signed", action="store_true")
    args = parser.parse_args()

    manifest, digest = load_xpi(args.xpi, args.require_signed)
    version, strict_min_version = validate_manifest(manifest)
    data = load_updates(args.input)
    updates = data["addons"][GECKO_ID]["updates"]
    if any(entry.get("version") == version for entry in updates):
        raise ValueError(f"version {version} already exists in the update manifest")
    updates.append(build_entry(version, args.update_link, digest, strict_min_version))
    updates.sort(key=lambda entry: version_key(str(entry["version"])))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"PASS wrote {args.output}")
    print(f"SHA256 {digest}  {args.xpi.name}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, json.JSONDecodeError, zipfile.BadZipFile) as error:
        print(f"FAIL {error}", file=sys.stderr)
        raise SystemExit(1)
