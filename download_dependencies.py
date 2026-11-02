#!/usr/bin/env python3
"""Prepare pinned browser dependencies using only the Python standard library.

No npm installation, package lifecycle scripts, or downloaded code execution.
All destinations are fixed beneath this script's demo directory. Temporary
downloads and atomic-write staging files stay in demo/work/.
"""

import argparse
import base64
import hashlib
import os
from pathlib import Path, PurePosixPath
import sys
import tarfile
import tempfile
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


DEMO_DIR = Path(__file__).resolve().parent
VENDOR_DIR = DEMO_DIR / "vendor"
WORK_DIR = DEMO_DIR / "work"
SDK_URL = "https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-1.1.1.tgz"
SDK_SHA512 = "jwntgT5tzDrKOkqg6xNDNpRcTUnGvmylZE5DFnzPXossiWOIDdZX+C81LI75hlXhsG58YZW+lGzcmjH1qrQE/Q=="
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
MODEL_SHA256 = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"
MODEL_BYTES = 3758596
MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
MAX_MODEL_BYTES = 8 * 1024 * 1024

# Only these exact members may be materialized from the verified npm archive.
# Source maps, CJS builds, declarations, package.json and README are not runtime
# dependencies of this demo and are intentionally not extracted.
SDK_FILES = {
    "vision_bundle.mjs": (156139, "a84921e02321e582484c1f8126d344b5f33b791fa09c640a52e20ee8632068f1"),
    "wasm/vision_wasm_internal.js": (334128, "6522286aa32dd93eff17c3da002b0649516f87abfec7a80b5bfe5c9625caa5f8"),
    "wasm/vision_wasm_module_internal.js": (334166, "539a4386fd12d0723d6e900ec80467d168ba7290dda2f79e77a2181b8e906115"),
    "wasm/vision_wasm_nosimd_internal.js": (333931, "942654dbdcebce08ea039af23d18e58bebf23c8607d74023d2df7071c8a7b638"),
    "wasm/vision_wasm_internal.wasm": (13519922, "0e101a010e262ef8e78f22e3c95b60a9705fd06962753c9acd6356d9fb56b7bd"),
    "wasm/vision_wasm_module_internal.wasm": (13519940, "3b57e4b55ac6346bf940212e3e11250b308a6a474077385e2f527b119cf74525"),
    "wasm/vision_wasm_nosimd_internal.wasm": (12627509, "c9b1b69bb87baf9e529254d8559dcbcf4c5a9c0eda84f56a12f17d675335ec9c"),
}


class OfficialRedirectHandler(HTTPRedirectHandler):
    """Reject origin changes before making the redirected request."""

    def redirect_request(self, request, response, code, message, headers, new_url):
        original = urlparse(request.full_url)
        target = urlparse(new_url)
        if target.scheme != "https" or target.hostname != original.hostname:
            raise RuntimeError("下载尝试重定向到非预期来源，已阻止")
        return super().redirect_request(request, response, code, message, headers, new_url)


def contained(path):
    """Reject symlinks or path tricks that resolve outside this demo directory."""
    resolved = path.resolve()
    try:
        resolved.relative_to(DEMO_DIR)
    except ValueError as exc:
        raise RuntimeError(f"目标路径超出当前 demo：{path}") from exc
    if resolved != Path(os.path.abspath(path)):
        raise RuntimeError(f"依赖目标不接受符号链接或目录重定向：{path}")
    return path


def file_digest(path, algorithm="sha256"):
    digest = hashlib.new(algorithm)
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.digest()


def valid_file(path, size, sha256):
    contained(path)
    return path.is_file() and path.stat().st_size == size and file_digest(path).hex() == sha256


def pending_files():
    pending = []
    for name, (size, sha256) in SDK_FILES.items():
        if not valid_file(VENDOR_DIR / name, size, sha256):
            pending.append(name)
    model_ok = valid_file(VENDOR_DIR / "face_landmarker.task", MODEL_BYTES, MODEL_SHA256)
    return pending, model_ok


def download_verified(url, cache_name, algorithm, expected_digest, max_bytes):
    """Fetch an HTTPS artifact into work/, verify it, then atomically cache it."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in {"registry.npmjs.org", "storage.googleapis.com"}:
        raise RuntimeError("依赖下载仅允许固定的官方 HTTPS 来源")
    cache = contained(WORK_DIR / cache_name)
    if cache.is_file() and cache.stat().st_size <= max_bytes and file_digest(cache, algorithm) == expected_digest:
        print(f"复用已校验下载缓存：{cache_name}")
        return cache

    contained(WORK_DIR).mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        request = Request(url, headers={"User-Agent": "AR-demo-dependency-preparer/1.0"})
        with build_opener(OfficialRedirectHandler()).open(request, timeout=60) as response:
            final = urlparse(response.geturl())
            if final.scheme != "https" or final.hostname != parsed.hostname:
                raise RuntimeError("下载被重定向到非预期来源")
            with tempfile.NamedTemporaryFile(prefix="dependency-", suffix=".part", dir=WORK_DIR, delete=False) as output:
                temporary = Path(output.name)
                digest = hashlib.new(algorithm)
                total = 0
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        raise RuntimeError("下载大小超过允许上限")
                    digest.update(chunk)
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
            if digest.digest() != expected_digest:
                raise RuntimeError(f"下载校验失败，未覆盖现有文件：{cache_name}")
        os.replace(temporary, cache)
        temporary = None
        print(f"已下载并校验：{cache_name}")
        return cache
    finally:
        if temporary is not None and temporary.exists():
            contained(temporary).unlink()


def atomic_copy(source, destination, expected_size, expected_sha256):
    """Copy one bounded stream to work/, verify, then replace its fixed target."""
    destination = contained(destination)
    contained(destination.parent).mkdir(parents=True, exist_ok=True)
    contained(WORK_DIR).mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix="verified-", suffix=".part", dir=WORK_DIR, delete=False) as output:
            temporary = Path(output.name)
            total = 0
            digest = hashlib.sha256()
            while True:
                chunk = source.read(min(1024 * 1024, expected_size + 1 - total))
                if not chunk:
                    break
                total += len(chunk)
                if total > expected_size:
                    raise RuntimeError(f"依赖文件大小异常：{destination.name}")
                digest.update(chunk)
                output.write(chunk)
            output.flush()
            os.fsync(output.fileno())
        if total != expected_size or digest.hexdigest() != expected_sha256:
            raise RuntimeError(f"依赖文件校验失败，未覆盖现有文件：{destination.name}")
        os.replace(temporary, destination)
        temporary = None
    finally:
        if temporary is not None and temporary.exists():
            contained(temporary).unlink()


def extract_sdk(archive_path, needed):
    """Inspect every member; do not call extract()/extractall() or run scripts."""
    wanted = {"package/" + name: name for name in needed}
    selected = {}
    with tarfile.open(archive_path, "r:gz") as archive:
        for member in archive.getmembers():
            name = PurePosixPath(member.name)
            if name.is_absolute() or ".." in name.parts or "\\" in member.name:
                raise RuntimeError("归档包含不安全路径，停止解包")
            if not (member.isfile() or member.isdir()):
                raise RuntimeError("归档包含链接或特殊文件，停止解包")
            if member.name in wanted:
                if member.name in selected or not member.isfile():
                    raise RuntimeError("归档白名单成员重复或类型异常")
                selected[member.name] = member
        if set(selected) != set(wanted):
            raise RuntimeError("归档缺少白名单文件")
        for packed_name, relative_name in wanted.items():
            member = selected[packed_name]
            size, sha256 = SDK_FILES[relative_name]
            if member.size != size:
                raise RuntimeError(f"归档成员大小与固定版本不符：{relative_name}")
            source = archive.extractfile(member)
            if source is None:
                raise RuntimeError(f"无法读取归档成员：{relative_name}")
            with source:
                atomic_copy(source, VENDOR_DIR / relative_name, size, sha256)
            print(f"已准备：vendor/{relative_name}")


def main():
    parser = argparse.ArgumentParser(description="下载并校验本 Demo 的固定版本依赖；不会执行第三方脚本。")
    parser.add_argument("--check", action="store_true", help="只读校验已有依赖，不联网、不创建目录、不写文件")
    args = parser.parse_args()
    contained(VENDOR_DIR)
    contained(WORK_DIR)
    needed, model_ok = pending_files()
    if args.check:
        for name in needed:
            print(f"缺失或校验不符：vendor/{name}")
        if not model_ok:
            print("缺失或校验不符：vendor/face_landmarker.task")
        if needed or not model_ok:
            return 1
        print("只读校验通过：7 个 SDK 文件与模型均匹配固定哈希；未联网、未写入。")
        return 0
    if not needed and model_ok:
        print("全部依赖已存在且校验通过，跳过下载；未改动现有依赖。")
        return 0
    if needed:
        archive = download_verified(SDK_URL, "tasks-vision-1.1.1.tgz", "sha512", base64.b64decode(SDK_SHA512), MAX_ARCHIVE_BYTES)
        extract_sdk(archive, needed)
    if not model_ok:
        model = download_verified(MODEL_URL, "face_landmarker-float16-1.task", "sha256", bytes.fromhex(MODEL_SHA256), MAX_MODEL_BYTES)
        with model.open("rb") as source:
            atomic_copy(source, VENDOR_DIR / "face_landmarker.task", MODEL_BYTES, MODEL_SHA256)
        print("已准备：vendor/face_landmarker.task")
    outstanding, model_ok = pending_files()
    if outstanding or not model_ok:
        raise RuntimeError("准备后复核失败，请保留错误信息排查")
    print("依赖准备完成。运行 node server.mjs，然后打开 http://127.0.0.1:8892/")
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    try:
        sys.exit(main())
    except (OSError, RuntimeError, tarfile.TarError, ValueError) as error:
        print(f"依赖准备失败：{error}", file=sys.stderr)
        print("未通过校验的下载不会覆盖原依赖。请检查官方来源连接后重试；不要关闭 HTTPS 证书校验。", file=sys.stderr)
        sys.exit(1)
