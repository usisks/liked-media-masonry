#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path, PurePosixPath

EXPECTED_MATCHES = {"https://x.com/*", "https://twitter.com/*"}
EXPECTED_PERMISSIONS = ["storage"]
EXPECTED_CONTENT_SCRIPTS = [
    "content/namespace.js",
    "content/settings.js",
    "content/diagnostics.js",
    "content/dom.js",
    "content/video.js",
    "content/board.js",
    "content/lightbox.js",
    "content/loading.js",
    "content/routing.js",
    "content/main.js",
]
EXPECTED_CONTENT_CSS = ["content.css"]
RELEASE_FILES = [
    *EXPECTED_CONTENT_SCRIPTS,
    *EXPECTED_CONTENT_CSS,
    "icons/icon16.png",
    "icons/icon32.png",
    "icons/icon48.png",
    "icons/icon128.png",
    "manifest.json",
    "popup.html",
    "popup.js",
    "popup.css",
    "README.md",
    "PRIVACY.md",
    "LICENSE",
]
FORBIDDEN_PRODUCTION_PATTERNS = {
    "localStorage": re.compile(r"\blocalStorage\b"),
    "fetch": re.compile(r"\bfetch\s*\("),
    "XMLHttpRequest": re.compile(r"\bXMLHttpRequest\b"),
    "WebSocket": re.compile(r"\bWebSocket\b"),
    "sendBeacon": re.compile(r"\bsendBeacon\s*\("),
    "eval": re.compile(r"\beval\s*\("),
    "Function constructor": re.compile(r"\bnew\s+Function\s*\("),
    "dynamic import": re.compile(r"\bimport\s*\("),
}


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def production_text(root: Path) -> str:
    text_files = [
        *EXPECTED_CONTENT_SCRIPTS,
        "popup.js",
        "popup.html",
        "manifest.json",
    ]
    return "\n".join((root / relative).read_text(encoding="utf-8") for relative in text_files)


def audit_source(root: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    manifest_path = root / "manifest.json"
    package_path = root / "package.json"
    if not manifest_path.is_file():
        return ["manifest.jsonがありません。"], warnings

    try:
        manifest = read_json(manifest_path)
    except Exception as error:
        return [f"manifest.jsonを解析できません: {error}"], warnings

    if manifest.get("manifest_version") != 3:
        errors.append("manifest_versionは3である必要があります。")
    if manifest.get("permissions") != EXPECTED_PERMISSIONS:
        errors.append(f"permissionsが想定外です: {manifest.get('permissions')}")
    if manifest.get("host_permissions"):
        errors.append("host_permissionsは使用しない方針です。")
    if manifest.get("web_accessible_resources"):
        errors.append("web_accessible_resourcesは現在不要です。")

    scripts = manifest.get("content_scripts") or []
    if len(scripts) != 1:
        errors.append("content_scriptsは1エントリである必要があります。")
    else:
        entry = scripts[0]
        if set(entry.get("matches") or []) != EXPECTED_MATCHES:
            errors.append(f"matchesが想定外です: {entry.get('matches')}")
        if entry.get("js") != EXPECTED_CONTENT_SCRIPTS:
            errors.append(f"content scriptの順序が想定外です: {entry.get('js')}")
        if entry.get("css") != EXPECTED_CONTENT_CSS:
            errors.append(f"content stylesheetが想定外です: {entry.get('css')}")
        if entry.get("run_at") != "document_idle":
            errors.append("run_atはdocument_idleである必要があります。")

    version = str(manifest.get("version") or "")
    if package_path.is_file():
        try:
            package = read_json(package_path)
            if package.get("version") != version:
                errors.append("manifest.jsonとpackage.jsonのバージョンが一致しません。")
        except Exception as error:
            errors.append(f"package.jsonを解析できません: {error}")

    for relative in RELEASE_FILES:
        if not (root / relative).is_file():
            errors.append(f"配布必須ファイルがありません: {relative}")

    html = (root / "popup.html").read_text(encoding="utf-8") if (root / "popup.html").is_file() else ""
    if re.search(r"<script(?![^>]*\bsrc=)[^>]*>", html, re.I):
        errors.append("popup.htmlにインラインscriptがあります。")
    script_sources = re.findall(r"<script[^>]+src=[\"']([^\"']+)", html, re.I)
    if script_sources != ["popup.js"]:
        errors.append(f"popup.htmlのscript参照が想定外です: {script_sources}")
    if re.search(r"<(?:script|link)[^>]+(?:src|href)=[\"']https?://", html, re.I):
        errors.append("popup.htmlが外部リソースを参照しています。")

    try:
        text = production_text(root)
    except Exception as error:
        errors.append(f"本番ファイルを読み込めません: {error}")
        text = ""
    for label, pattern in FORBIDDEN_PRODUCTION_PATTERNS.items():
        if pattern.search(text):
            errors.append(f"本番コードに禁止パターンがあります: {label}")
    if re.search(r"プライバシーポリシー草案|この草案", text):
        errors.append("公開パッケージに草案表記があります。")
    if re.search(r"sensitiveOnly|センシティブ投稿のみ|contentWarning", text, re.I):
        errors.append("削除済みのセンシティブ限定機能が再混入しています。")

    node = subprocess.run(["node", "--version"], text=True, capture_output=True, check=False)
    if node.returncode == 0:
        for relative in [*EXPECTED_CONTENT_SCRIPTS, "popup.js"]:
            result = subprocess.run(
                ["node", "--check", str(root / relative)],
                text=True,
                capture_output=True,
                check=False,
            )
            if result.returncode != 0:
                errors.append(f"JavaScript構文エラー: {relative}: {result.stderr.strip()}")
    else:
        warnings.append("Node.jsが見つからないためJavaScript構文検査を省略しました。")

    try:
        from PIL import Image

        expected_sizes = {"16": 16, "32": 32, "48": 48, "128": 128}
        for key, size in expected_sizes.items():
            path = root / f"icons/icon{key}.png"
            with Image.open(path) as image:
                if image.format != "PNG" or image.size != (size, size):
                    errors.append(f"アイコン形式または寸法が不正です: {path.name} {image.format} {image.size}")
                if key == "128":
                    alpha = image.convert("RGBA").getchannel("A")
                    bbox = alpha.getbbox()
                    if bbox == (0, 0, 128, 128):
                        warnings.append("icon128.pngは透明余白がありません。ストア用アイコンの推奨余白を再確認してください。")
    except ImportError:
        warnings.append("Pillowがないためアイコン寸法検査を省略しました。")
    except Exception as error:
        errors.append(f"アイコン検査に失敗しました: {error}")

    return errors, warnings


def audit_zip(zip_path: Path, source_root: Path | None = None) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not zip_path.is_file():
        return [f"ZIPがありません: {zip_path}"], warnings
    expected = set(RELEASE_FILES)
    with zipfile.ZipFile(zip_path) as archive:
        members = [name for name in archive.namelist() if not name.endswith("/")]
        member_set = set(members)
        for name in members:
            path = PurePosixPath(name)
            if path.is_absolute() or ".." in path.parts:
                errors.append(f"ZIPに不正なパスがあります: {name}")
        missing = expected - member_set
        extra = member_set - expected
        if missing:
            errors.append(f"ZIPに必須ファイルがありません: {sorted(missing)}")
        if extra:
            errors.append(f"ZIPに不要なファイルがあります: {sorted(extra)}")
        bad = archive.testzip()
        if bad:
            errors.append(f"ZIP破損を検出しました: {bad}")
        try:
            manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
            if source_root:
                source_manifest = read_json(source_root / "manifest.json")
                if manifest.get("version") != source_manifest.get("version"):
                    errors.append("ZIPとソースのmanifestバージョンが一致しません。")
        except Exception as error:
            errors.append(f"ZIP内manifest.jsonを解析できません: {error}")
    return errors, warnings


def print_result(errors: list[str], warnings: list[str]) -> int:
    for warning in warnings:
        print(f"WARN {warning}")
    if errors:
        for error in errors:
            print(f"FAIL {error}")
        return 1
    print("PASS release audit")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Liked Media Masonry release audit")
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--zip", dest="zip_path", type=Path)
    args = parser.parse_args()
    source = args.source.resolve()
    errors, warnings = audit_source(source)
    if args.zip_path:
        zip_errors, zip_warnings = audit_zip(args.zip_path.resolve(), source)
        errors.extend(zip_errors)
        warnings.extend(zip_warnings)
    return print_result(errors, warnings)


if __name__ == "__main__":
    raise SystemExit(main())
