"""Account-bound outbound transport and per-user app lifecycle."""
from __future__ import annotations
import hashlib
import json
import os
import plistlib
import secrets
import shutil
import ssl
import sys
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer
from socketserver import TCPServer
from pathlib import Path

VERSION = '0.2.0'
ASSETS = Path(getattr(sys, '_MEIPASS', Path(__file__).parent))
BASE = (Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'Campus' / 'Connect' if sys.platform == 'win32'
        else Path.home() / 'Library' / 'Application Support' / 'Campus' / 'Connect')

def private_dir(path):
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.chmod(0o700)

def write_private(path, value):
    private_dir(path.parent)
    temporary = path.with_name(path.name + '.tmp-' + secrets.token_hex(6))
    fd = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        json.dump(value, stream)
    temporary.replace(path)

def relay_origin(value):
    parsed = urllib.parse.urlsplit(value)
    if (parsed.username or parsed.password or parsed.path not in ('','/') or parsed.query or parsed.fragment or
        (parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1','localhost')))):
        raise ValueError('Campus Connect necesita un origen HTTPS de Campus.')
    return value.rstrip('/')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

class Relay:
    def __init__(self, origin):
        import certifi
        self.origin = relay_origin(origin)
        context = ssl.create_default_context()
        context.load_verify_locations(certifi.where())
        self.opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=context))

    def request(self, route, payload=None, token='', max_bytes=2_000_000):
        if not route.startswith('/') or route.startswith('//'):
            raise ValueError('Ruta de Campus inválida.')
        headers = {'User-Agent': 'Campus-Connect/' + VERSION}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        if payload is not None:
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(self.origin + route, data=json.dumps(payload).encode() if payload is not None else None, headers=headers)
        with self.opener.open(request, timeout=30) as response:
            raw = response.read(max_bytes + 1)
        if len(raw) > max_bytes:
            raise ValueError('La respuesta excede el tamaño permitido.')
        return raw

    def post(self, route, payload, token=''):
        return json.loads(self.request('/v1/integrations/connect' + route, payload, token))

    def catalog(self):
        return json.loads(self.request('/v1/integrations/connect/catalog'))

    def package(self, entry):
        # No URL or command from user input, no redirects, no device credential.
        expected = '/integrations/connect/packages/' + entry['id'] + '/'
        package = entry['package']
        if not package['url'].startswith(expected) or package['url'] != expected + package['fileName']:
            raise ValueError('La descarga no pertenece al catálogo de Campus.')
        data = self.request(package['url'], max_bytes=min(package['size'], 100_000_000))
        if len(data) != package['size'] or hashlib.sha256(data).hexdigest() != package['sha256']:
            raise ValueError('La descarga no pasó la verificación. Vuelve a intentarlo.')
        return data

def command(*args):
    return [sys.executable] + ([] if getattr(sys, 'frozen', False) else [str(Path(__file__).with_name('app.py'))]) + list(args)

def install_startup(base=BASE):
    if not getattr(sys, 'frozen', False):
        return
    private_dir(base)
    if sys.platform == 'darwin':
        source = Path(sys.executable).parents[2]
        destination = Path.home() / 'Applications' / 'Campus Connect.app'
        destination.parent.mkdir(exist_ok=True)
        if source != destination:
            staging = destination.with_name('Campus Connect.pending.app')
            if staging.exists():
                shutil.rmtree(staging)
            shutil.copytree(source, staging, symlinks=True)
            if destination.exists():
                shutil.rmtree(destination)
            staging.replace(destination)
        agent = Path.home() / 'Library/LaunchAgents/com.campuscli.connect.plist'
        agent.parent.mkdir(parents=True, exist_ok=True)
        agent.write_bytes(plistlib.dumps({'Label': 'com.campuscli.connect', 'RunAtLoad': True,
            'ProgramArguments': [str(destination / 'Contents/MacOS/Campus Connect'), '--background']}))
        agent.chmod(0o600)
    elif sys.platform == 'win32':
        destination = base / 'Campus Connect.exe'
        if Path(sys.executable) != destination:
            shutil.copyfile(sys.executable, destination)
        import winreg
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows\CurrentVersion\Run') as key:
            winreg.SetValueEx(key, 'CampusConnect', 0, winreg.REG_SZ, '"' + str(destination) + '" --background')

def remove_startup():
    if sys.platform == 'darwin':
        (Path.home() / 'Library/LaunchAgents/com.campuscli.connect.plist').unlink(missing_ok=True)
    elif sys.platform == 'win32':
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows\CurrentVersion\Run', 0, winreg.KEY_SET_VALUE) as key:
                winreg.DeleteValue(key, 'CampusConnect')
        except FileNotFoundError:
            pass

class LoopbackServer(ThreadingHTTPServer):
    """Loopback services have a known name; never wait on reverse DNS at boot.

    HTTPServer.server_bind calls socket.getfqdn, which can stall a frozen macOS
    app on resolver/network permission checks before its UI or MCP handshake.
    This keeps the same TCP binding, request handling and address validation.
    """
    def server_bind(self):
        TCPServer.server_bind(self)
        self.server_name = 'localhost'
        self.server_port = self.server_address[1]
