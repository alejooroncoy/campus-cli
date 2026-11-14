"""Explicit local setup only. No device credentials are available to this code."""
import ctypes
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).parent

def version(app):
    value = app.name
    if sys.platform == 'darwin':
        try:
            with (app / 'Contents/Info.plist').open('rb') as stream:
                info = plistlib.load(stream)
            value = info.get('CFBundleShortVersionString', info.get('CFBundleVersion', value))
        except (OSError, ValueError):
            pass
    match = re.search(r'(\d+)\.(\d+)', str(value))
    return tuple(map(int, match.groups())) if match else (0, 0)

def installations():
    if sys.platform == 'darwin':
        roots = [Path('/Applications'), Path.home() / 'Applications']
        apps = {app for root in roots for pattern in ('*Packet*Tracer*.app','*Packet*Tracer*/*Packet*Tracer*.app') for app in root.glob(pattern)}
    elif sys.platform == 'win32':
        roots = [Path(os.environ.get(key, 'C:/Program Files')) for key in ('ProgramFiles','ProgramFiles(x86)')]
        apps = {app for root in roots for app in root.glob('*Packet Tracer*') if (app / 'bin/PacketTracer.exe').is_file()}
    else:
        apps = set()
    return sorted((app for app in apps if version(app) >= (8, 2)), key=version, reverse=True)

def main():
    # The legacy companion owns the same loopback bridge. Do not attach Connect
    # to that process or let two Campus identities control the same lab.
    import socket
    with socket.socket() as sock:
        if sock.connect_ex(('127.0.0.1', 54321)) == 0:
            return {'state': 'required', 'message': 'El puente de Packet Tracer ya está en uso. Desactiva y cierra Campus Packet Tracer u otro MCP de Packet Tracer antes de activar esta integración.'}
    apps = installations()
    if not apps:
        return {'state': 'required', 'message': 'Instala Cisco Packet Tracer 8.2 o posterior y vuelve a activar esta integración.'}
    source = ROOT / 'MCP-Control-Center.pts'
    manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    expected = manifest['files']['MCP-Control-Center.pts']
    if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
        raise ValueError('La extensión cambió. Reinstala la integración.')
    target = (apps[0] / 'Contents/extensions' if sys.platform == 'darwin' else apps[0] / 'extensions') / 'MCPControlCenter/MCPControlCenter.pts'
    if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == expected:
        return {'state': 'ready'}
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        return {'state': 'ready'}
    except PermissionError:
        # UAC elevation is limited to this verified file-copy setup. The host
        # and its account credentials always remain unelevated.
        if sys.platform == 'win32' and getattr(sys, 'frozen', False) and not ctypes.windll.shell32.IsUserAnAdmin():
            import base64
            executable = sys.executable.replace("'", "''")
            base = str(ROOT.parents[2]).replace("'", "''")
            script = "$p=Start-Process -FilePath '" + executable + "' -ArgumentList @('--setup-worker','packet-tracer','\"" + base + "\"') -Verb RunAs -Wait -PassThru;exit $p.ExitCode"
            result = subprocess.run(['powershell.exe','-NoProfile','-EncodedCommand',base64.b64encode(script.encode('utf-16le')).decode()], timeout=120)
            if result.returncode == 0 and target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == expected:
                return {'state': 'ready'}
        return {'state': 'required', 'message': 'Agrega MCP-Control-Center.pts desde Packet Tracer: Extensions → Scripting → Configure PT Script Modules → Add. La extensión está en la carpeta de esta integración; usa «Abrir carpeta» en Campus Connect y vuelve a activarla.'}

result = main()
print(json.dumps(result, ensure_ascii=False))
if result.get('state') != 'ready':
    sys.exit(0)
