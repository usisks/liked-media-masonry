#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import zipfile
from pathlib import Path, PurePosixPath

GECKO_ID = "{6c4bffd1-76c7-4c99-ba48-367642193e15}"
FIREFOX_MIN_VERSION = "140.0"
UPDATE_URL = "https://usisks.github.io/liked-media-masonry/firefox/updates.json"
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
COMMON_RELEASE_FILES = [
    *EXPECTED_CONTENT_SCRIPTS,
    *EXPECTED_CONTENT_CSS,
    "icons/icon16.png",
    "icons/icon32.png",
    "icons/icon48.png",
    "icons/icon128.png",
    "popup.html",
    "popup.js",
    "popup.css",
    "README.md",
    "PRIVACY.md",
    "LICENSE",
]
RELEASE_FILES = [*COMMON_RELEASE_FILES, "manifest.json"]
MANIFEST_SOURCES = {
    "chrome": "manifest.json",
    "firefox": "manifests/firefox.json",
}
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
SIGNATURE_MEMBERS = {
    "META-INF/mozilla.rsa",
    "META-INF/mozilla.sf",
    "META-INF/cose.sig",
    "META-INF/cose.manifest",
}


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def production_text(root: Path) -> str:
    names = [*EXPECTED_CONTENT_SCRIPTS, "popup.js", "popup.html"]
    return "\n".join((root / name).read_text(encoding="utf-8") for name in names)


def validate_common_manifest(manifest: dict, label: str) -> list[str]:
    errors: list[str] = []
    if manifest.get("manifest_version") != 3:
        errors.append(f"{label}: manifest_version must be 3")
    if manifest.get("permissions") != EXPECTED_PERMISSIONS:
        errors.append(f"{label}: unexpected permissions {manifest.get('permissions')}")
    if manifest.get("host_permissions"):
        errors.append(f"{label}: host_permissions must remain absent")
    if manifest.get("web_accessible_resources"):
        errors.append(f"{label}: web_accessible_resources must remain absent")

    scripts = manifest.get("content_scripts") or []
    if len(scripts) != 1:
        errors.append(f"{label}: expected exactly one content_scripts entry")
    else:
        entry = scripts[0]
        if set(entry.get("matches") or []) != EXPECTED_MATCHES:
            errors.append(f"{label}: unexpected content script matches")
        if entry.get("js") != EXPECTED_CONTENT_SCRIPTS:
            errors.append(f"{label}: content script order differs")
        if entry.get("css") != EXPECTED_CONTENT_CSS:
            errors.append(f"{label}: unexpected content stylesheets")
        if entry.get("run_at") != "document_idle":
            errors.append(f"{label}: run_at must be document_idle")
    return errors


def validate_browser_manifest(manifest: dict, browser: str) -> list[str]:
    errors = validate_common_manifest(manifest, browser)
    settings = manifest.get("browser_specific_settings")
    if browser == "chrome":
        if settings:
            errors.append("chrome: browser_specific_settings must not be included")
        if UPDATE_URL in json.dumps(manifest):
            errors.append("chrome: Firefox update_url leaked into Chrome manifest")
        return errors

    gecko = (settings or {}).get("gecko", {})
    if gecko.get("id") != GECKO_ID:
        errors.append("firefox: Gecko ID is missing or changed")
    if gecko.get("strict_min_version") != FIREFOX_MIN_VERSION:
        errors.append("firefox: strict_min_version is missing or changed")
    if gecko.get("strict_max_version") is not None:
        errors.append("firefox: strict_max_version must remain absent")
    if gecko.get("update_url") != UPDATE_URL:
        errors.append("firefox: update_url is missing or changed")
    if gecko.get("data_collection_permissions", {}).get("required") != ["none"]:
        errors.append('firefox: data_collection_permissions.required must be ["none"]')
    return errors


def audit_source(root: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    manifests: dict[str, dict] = {}
    for browser, relative in MANIFEST_SOURCES.items():
        path = root / relative
        if not path.is_file():
            errors.append(f"missing {relative}")
            continue
        try:
            manifests[browser] = read_json(path)
            errors.extend(validate_browser_manifest(manifests[browser], browser))
        except Exception as error:
            errors.append(f"cannot parse {relative}: {error}")

    package_path = root / "package.json"
    if package_path.is_file() and manifests:
        try:
            package_version = read_json(package_path).get("version")
            versions = {manifest.get("version") for manifest in manifests.values()}
            if versions != {package_version}:
                errors.append(
                    f"manifest/package versions differ: manifests={sorted(str(v) for v in versions)} package={package_version}"
                )
        except Exception as error:
            errors.append(f"cannot parse package.json: {error}")

    for relative in COMMON_RELEASE_FILES:
        if not (root / relative).is_file():
            errors.append(f"missing release file: {relative}")

    html_path = root / "popup.html"
    html = html_path.read_text(encoding="utf-8") if html_path.is_file() else ""
    if re.search(r"<script(?![^>]*\bsrc=)[^>]*>", html, re.I):
        errors.append("popup.html contains inline JavaScript")
    script_sources = re.findall(r"<script[^>]+src=[\"']([^\"']+)", html, re.I)
    if script_sources != ["popup.js"]:
        errors.append(f"unexpected popup script sources: {script_sources}")
    if re.search(r"<(?:script|link)[^>]+(?:src|href)=[\"']https?://", html, re.I):
        errors.append("popup.html references a remote script or stylesheet")

    try:
        text = production_text(root)
        for label, pattern in FORBIDDEN_PRODUCTION_PATTERNS.items():
            if pattern.search(text):
                errors.append(f"forbidden production pattern: {label}")
    except Exception as error:
        errors.append(f"cannot read production files: {error}")

    try:
        node = subprocess.run(["node", "--version"], text=True, capture_output=True, check=False)
    except FileNotFoundError:
        node = None
    if node and node.returncode == 0:
        for relative in [*EXPECTED_CONTENT_SCRIPTS, "popup.js"]:
            result = subprocess.run(
                ["node", "--check", str(root / relative)],
                text=True,
                capture_output=True,
                check=False,
            )
            if result.returncode != 0:
                errors.append(f"JavaScript syntax error in {relative}: {result.stderr.strip()}")
    else:
        warnings.append("Node.js is unavailable; JavaScript syntax checks were skipped")

    try:
        from PIL import Image

        for size in (16, 32, 48, 128):
            path = root / f"icons/icon{size}.png"
            with Image.open(path) as image:
                if image.format != "PNG" or image.size != (size, size):
                    errors.append(f"invalid icon {path.name}: {image.format} {image.size}")
    except ImportError:
        warnings.append("Pillow is unavailable; icon checks were skipped")
    except Exception as error:
        errors.append(f"icon validation failed: {error}")
    return errors, warnings


def audit_archive(
    archive_path: Path,
    expected_manifest: dict | None = None,
    *,
    require_signed: bool = False,
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not archive_path.is_file():
        return [f"archive does not exist: {archive_path}"], warnings

    with zipfile.ZipFile(archive_path) as archive:
        members = [name for name in archive.namelist() if not name.endswith("/")]
        member_set = set(members)
        for name in members:
            path = PurePosixPath(name)
            if path.is_absolute() or ".." in path.parts:
                errors.append(f"unsafe archive member: {name}")
            if ".git" in path.parts or "node_modules" in path.parts:
                errors.append(f"forbidden archive member: {name}")

        missing = set(RELEASE_FILES) - member_set
        allowed_extra = {name for name in member_set if name.startswith("META-INF/")}
        extra = member_set - set(RELEASE_FILES) - allowed_extra
        if missing:
            errors.append(f"archive is missing files: {sorted(missing)}")
        if extra:
            errors.append(f"archive contains unexpected files: {sorted(extra)}")
        if require_signed and not (member_set & SIGNATURE_MEMBERS):
            errors.append("XPI has no recognizable Mozilla signature metadata")
        if not require_signed and allowed_extra:
            warnings.append("archive contains META-INF signature metadata")

        bad = archive.testzip()
        if bad:
            errors.append(f"corrupt archive member: {bad}")
        try:
            embedded_manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
            if expected_manifest and embedded_manifest != expected_manifest:
                errors.append("archive manifest differs from the expected browser manifest")
        except Exception as error:
            errors.append(f"cannot parse archive manifest.json: {error}")
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
    parser = argparse.ArgumentParser(description="Audit Chrome and Firefox release inputs")
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--archive", "--zip", dest="archive_path", type=Path)
    parser.add_argument("--browser", choices=("chrome", "firefox"))
    parser.add_argument("--require-signed", action="store_true")
    args = parser.parse_args()
    root = args.source.resolve()
    errors, warnings = audit_source(root)
    if args.archive_path:
        if not args.browser:
            errors.append("--browser is required when auditing an archive")
        else:
            expected = read_json(root / MANIFEST_SOURCES[args.browser])
            archive_errors, archive_warnings = audit_archive(
                args.archive_path.resolve(),
                expected,
                require_signed=args.require_signed,
            )
            errors.extend(archive_errors)
            warnings.extend(archive_warnings)
    return print_result(errors, warnings)


if __name__ == "__main__":
    raise SystemExit(main())
