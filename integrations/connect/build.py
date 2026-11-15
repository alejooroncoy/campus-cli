"""Build the generic host and independent integration archives.

The host contains Python + MCP runtime, but no packet_tracer_mcp code. The
Packet Tracer plugin can be published or repaired without rebuilding the host.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from connect_common import VERSION, relay_origin

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).resolve().parent
EXTENSION_URL = 'https://github.com/Mats2208/MCP-Packet-Tracer/releases/download/v0.12.0/MCP-Control-Center.pts'
EXTENSION_SHA = 'd2ef03725f0c7128583a8b2a5f6a5e84c477f1ba125c28123da9a9930981f1d0'

def fetch_verified(url, digest, max_size=1_000_000):
    with urllib.request.urlopen(url, timeout=30) as response:
        data = response.read(max_size + 1)
    if len(data) > max_size or hashlib.sha256(data).hexdigest() != digest:
        raise ValueError('The pinned build asset failed integrity verification.')
    return data

def make_archive(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    # Stable byte-for-byte archives across platforms. No pyc, symlinks, secrets,
    # timestamps or build-machine paths enter a plugin package.
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(source.rglob('*'), key=lambda file: file.relative_to(source).as_posix()):
            if file.is_file():
                info = zipfile.ZipInfo(file.relative_to(source).as_posix(), date_time=(2026,1,1,0,0,0))
                info.create_system = 3
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100600 << 16
                archive.writestr(info, file.read_bytes())

def write_manifest(directory, prefix, version, platform, archive):
    entry = {'platform': platform, 'fileName': archive.name, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'size': archive.stat().st_size}
    manifest = directory / 'manifest.json'
    current = json.loads(manifest.read_text()) if manifest.exists() else {'version':version, 'files':[]}
    if current['version'] != version:
        raise ValueError('Do not mix app versions in an artifact manifest.')
    current['files'] = [file for file in current['files'] if file['platform'] != platform] + [entry]
    manifest.write_text(json.dumps(current, indent=2) + '\n', encoding='utf-8')
    return entry

def build_plugins(output):
    metadata = json.loads((ROOT / 'src/cloud/connect/catalog.json').read_text(encoding='utf-8'))
    entries = []
    for item in metadata:
        if item['id'] != 'packet-tracer':
            raise ValueError('Add a reviewed package recipe before publishing a new integration.')
        spec = importlib.util.find_spec('packet_tracer_mcp')
        from importlib.metadata import version, distribution
        if not spec or version('packet-tracer-mcp') != item['upstreamVersion']:
            raise ValueError('Install the pinned plugin build dependencies first.')
        work = ROOT / '.tmp/connect-plugin-build' / item['id']
        if work.exists():
            shutil.rmtree(work)
        work.mkdir(parents=True)
        shutil.copytree(Path(spec.origin).parent, work / 'packet_tracer_mcp', ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
        dist = distribution('packet-tracer-mcp')
        metadata = work / f"packet_tracer_mcp-{item['upstreamVersion']}.dist-info"
        metadata.mkdir()
        for name in ('METADATA','WHEEL'):
            (metadata / name).write_text(dist.read_text(name), encoding='utf-8', newline='\n')
        for name in ('runner.py','setup.py','editing.py'):
            shutil.copyfile(SOURCE / 'plugins' / item['id'] / name, work / name)
        shutil.copyfile(ROOT / 'src/cloud/packet-tracer/policy.json', work / 'policy.json')
        shutil.copyfile(ROOT / 'integrations/packet-tracer/UPSTREAM-LICENSE.txt', work / 'UPSTREAM-LICENSE.txt')
        (work / 'MCP-Control-Center.pts').write_bytes(fetch_verified(EXTENSION_URL, EXTENSION_SHA))
        for file in work.rglob('*'):
            if file.is_file() and file.suffix in ('.py','.json','.txt'):
                file.write_bytes(file.read_bytes().replace(b'\r\n', b'\n'))
        manifest = {'format':'campus-integration-v1', 'hostApi':1, 'runtime':'python-mcp',
            'id':item['id'], 'version':item['version'], 'upstreamVersion':item['upstreamVersion'],
            'entrypoint':'runner.py', 'setup':'setup.py', 'workspace':'PacketTracer',
            'permissions':item['permissions'], 'platforms':item['platforms'],
            'files':{file.relative_to(work).as_posix():hashlib.sha256(file.read_bytes()).hexdigest() for file in sorted(work.rglob('*'), key=lambda file: file.relative_to(work).as_posix()) if file.is_file()}}
        (work / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
        directory = output / 'plugins' / item['id']
        archive = directory / f"campus-connect-plugin-{item['id']}-{item['version']}-any.zip"
        make_archive(work, archive)
        entry = write_manifest(directory, 'campus-connect-plugin-' + item['id'], item['version'], 'any', archive)
        entries.append(entry)
    return entries

def build_app(output, relay):
    import platform
    target = 'macos' if sys.platform == 'darwin' else 'windows' if sys.platform == 'win32' else None
    arch = 'arm64' if platform.machine().lower() in ('arm64','aarch64') else 'x64'
    if not target or target == 'windows' and arch != 'x64':
        raise ValueError('Build on the target OS: macOS arm64/x64 or Windows x64.')
    work = ROOT / '.tmp' / ('connect-build-' + target + '-' + arch)
    work.mkdir(parents=True, exist_ok=True)
    config = work / 'build-config.json'
    config.write_text(json.dumps({'version':VERSION, 'relayOrigin':relay}), encoding='utf-8')
    command = [sys.executable,'-m','PyInstaller','--noconfirm','--clean','--windowed','--name','Campus Connect',
        '--distpath',str(work / 'dist'),'--workpath',str(work / 'build'),'--specpath',str(work),
        '--paths',str(SOURCE), '--collect-all','mcp','--collect-all','jsonschema_specifications','--collect-all','certifi',
        '--copy-metadata','mcp','--copy-metadata','pydantic','--exclude-module','packet_tracer_mcp',
        '--add-data',str(config) + os.pathsep + '.', '--add-data',str(SOURCE / 'ui.html') + os.pathsep + '.',
        '--add-data',str(SOURCE / 'assets') + os.pathsep + '.']
    if target == 'macos':
        command += ['--onedir','--osx-bundle-identifier','com.campuscli.connect']
        if os.environ.get('APPLE_SIGNING_IDENTITY'):
            command += ['--codesign-identity',os.environ['APPLE_SIGNING_IDENTITY']]
    else:
        command += ['--onefile']
    subprocess.run(command + [str(SOURCE / 'app.py')], check=True)
    app = work / 'dist' / ('Campus Connect.app' if target == 'macos' else 'Campus Connect.exe')
    binary = app / 'Contents/MacOS/Campus Connect' if target == 'macos' else app
    subprocess.run([str(binary),'--self-test'], check=True, timeout=60)
    if (output / 'plugins/packet-tracer/manifest.json').is_file():
        subprocess.run([sys.executable,str(SOURCE / 'native_smoke.py'),'--binary',str(binary),'--artifacts',str(output)], check=True, timeout=60)
    if target == 'macos' and os.environ.get('APPLE_NOTARY_PROFILE'):
        submission = work / 'notarize.zip'
        subprocess.run(['ditto','-c','-k','--keepParent',str(app),str(submission)], check=True)
        subprocess.run(['xcrun','notarytool','submit',str(submission),'--keychain-profile',os.environ['APPLE_NOTARY_PROFILE'],'--wait'], check=True)
        subprocess.run(['xcrun','stapler','staple',str(app)], check=True)
    if target == 'windows' and os.environ.get('WINDOWS_SIGNING_THUMBPRINT'):
        subprocess.run(['signtool','sign','/sha1',os.environ['WINDOWS_SIGNING_THUMBPRINT'],'/fd','SHA256','/tr','http://timestamp.digicert.com','/td','SHA256',str(app)], check=True)
    directory = output / 'app'
    directory.mkdir(parents=True, exist_ok=True)
    archive = directory / f'campus-connect-{VERSION}-{target}-{arch}.zip'
    if target == 'macos':
        stage = work / 'Campus Connect'
        if stage.exists():
            shutil.rmtree(stage)
        stage.mkdir()
        shutil.copytree(app, stage / app.name, symlinks=True)
        shutil.copyfile(SOURCE / 'LEEME.txt', stage / 'LEEME.txt')
        subprocess.run(['ditto','-c','-k','--keepParent',str(stage),str(archive)], check=True)
    else:
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as zipped:
            zipped.write(app, app.name)
            zipped.write(SOURCE / 'LEEME.txt', 'LEEME.txt')
    return write_manifest(directory, 'campus-connect', VERSION, target + '-' + arch, archive)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--relay',default='https://mcp.campuscli.com')
    parser.add_argument('--output',type=Path,default=ROOT / '.tmp/connect-release')
    parser.add_argument('--plugins-only',action='store_true')
    parser.add_argument('--app-only',action='store_true')
    args = parser.parse_args()
    relay = relay_origin(args.relay)
    if not args.app_only:
        print(json.dumps(build_plugins(args.output)))
    if not args.plugins_only:
        print(json.dumps(build_app(args.output, relay)))
if __name__ == '__main__':
    main()
