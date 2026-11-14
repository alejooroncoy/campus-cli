"""Campus Connect: one local host, independently installed curated MCP packages."""
from __future__ import annotations
import io
import json
import os
from pathlib import Path
import platform
import runpy
import secrets
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from connect_common import ASSETS, BASE, VERSION, Relay, private_dir, write_private, install_startup, remove_startup, LoopbackServer
from connect_packages import PackageStore, valid_id
from connect_runtime import McpProcess, setup_package


def current_platform():
    arch = 'arm64' if platform.machine().lower() in ('arm64','aarch64') else 'x64'
    return ('macos-' if sys.platform == 'darwin' else 'windows-' if sys.platform == 'win32' else 'unsupported-') + arch

class Connect:
    def __init__(self, relay, base=BASE):
        self.relay, self.base = relay, base.resolve()
        self.packages = PackageStore(self.base)
        self.session = secrets.token_urlsafe(32)
        self.stop = threading.Event()
        self.lock = threading.RLock()
        self.processes = {}
        self.errors = {}
        self.catalog = []
        self.catalog_error = ''
        self.change_id = self.change_action = ''
        try:
            cache = json.loads((self.base / 'catalog.json').read_text(encoding='utf-8'))
            if cache.get('relay') == self.relay.origin:
                self.catalog = cache['integrations']
        except (OSError, ValueError, KeyError):
            pass
        self.active = self.busy = self.changing = self.link_running = False
        self.token = self.user_code = self.verification_url = ''
        self.message = 'Vincula tu computadora y elige las integraciones que necesitas.'
        self.ui_url = ''
        self.current = None

    def refresh_catalog(self):
        try:
            entries = self.relay.catalog()['integrations']
            if not isinstance(entries, list) or len(entries) > 30:
                raise ValueError('Catálogo inválido.')
            for item in entries:
                valid_id(item['id'])
            with self.lock:
                self.catalog = entries
                self.catalog_error = ''
                write_private(self.base / 'catalog.json', {'relay': self.relay.origin, 'integrations': entries})
        except Exception:
            self.catalog_error = 'No se pudo consultar el catálogo de Campus. Comprueba tu conexión y pulsa Actualizar catálogo.'

    def pair_request(self, route, payload, deadline):
        delay = 3
        while self.active and not self.stop.is_set() and time.time() < deadline:
            try:
                return self.relay.post(route, payload)
            except urllib.error.HTTPError as error:
                if error.code not in (429,500,502,503,504):
                    raise
                try:
                    delay = min(60, max(1, float(error.headers.get('Retry-After', delay))))
                except (ValueError, AttributeError):
                    pass
            except (OSError, ValueError):
                pass
            self.message = 'Campus está temporalmente fuera de alcance. La vinculación sigue pendiente.'
            self.stop.wait(min(delay + secrets.randbelow(3), max(0, deadline - time.time())))
            delay = min(delay * 2, 30)
        raise ValueError('La vinculación venció o fue cancelada. Vuelve a conectar tu computadora.')

    def credentials(self):
        try:
            saved = json.loads((self.base / 'device.json').read_text(encoding='utf-8'))
            if saved['relay'] == self.relay.origin and saved['expiresAt'] > time.time() * 1000:
                return saved['token']
        except (OSError, ValueError, KeyError):
            pass
        pair = self.pair_request('/pair/start', {'label': socket.gethostname()[:80] or 'Mi computadora'}, time.time() + 600)
        expected = self.relay.origin + '/integrations/connect/pair#code=' + pair['userCode']
        if pair['verificationUrl'] != expected:
            raise ValueError('La dirección de vinculación no es válida.')
        self.user_code, self.verification_url = pair['userCode'], expected
        webbrowser.open(expected)
        while self.active and not self.stop.wait(max(3, min(30, pair['interval']))):
            if time.time() * 1000 >= pair['expiresAt']:
                raise ValueError('El código venció. Vuelve a conectar tu computadora.')
            result = self.pair_request('/pair/poll', {'deviceCode': pair['deviceCode']}, pair['expiresAt'] / 1000)
            if result['state'] == 'connected':
                write_private(self.base / 'device.json', {**result, 'relay': self.relay.origin})
                return result['token']
        return ''

    def activate(self):
        with self.lock:
            if self.link_running:
                return
            self.active = self.link_running = True
        try:
            install_startup(self.base)
            write_private(self.base / 'consent.json', {'relay': self.relay.origin, 'version': VERSION})
            self.message = 'Preparando la vinculación con tu cuenta Campus…'
            self.token = self.credentials()
            if not self.token or not self.active or self.stop.is_set():
                if self.token:
                    self.relay.post('/disconnect', {}, self.token)
                self.forget()
                return
            self.user_code = self.verification_url = ''
            self.message = 'Computadora vinculada. Activa una integración para continuar desde tu cliente de IA.'
            while not self.stop.is_set() and self.active:
                try:
                    response = self.relay.post('/next', {'connectorVersion': VERSION, 'busy': self.busy or self.changing,
                        'integrations': self.health()}, self.token)
                    if response.get('job') and not self.busy:
                        self.busy = True
                        threading.Thread(target=self.work, args=(response['job'],), daemon=True).start()
                except urllib.error.HTTPError as error:
                    if error.code == 401:
                        self.forget()
                        self.message = 'El equipo fue desconectado o venció. Vuelve a vincularlo con Campus.'
                        return
                    self.message = 'Campus está temporalmente fuera de alcance. Reconectando…'
                except (OSError, ValueError):
                    self.message = 'Campus está temporalmente fuera de alcance. Reconectando…'
                self.stop.wait(3)
        except Exception:
            self.message = 'No se pudo vincular la computadora. Comprueba tu conexión y vuelve a intentarlo.'
        finally:
            self.active = self.link_running = False

    def health(self):
        with self.lock:
            return [{'id': id, 'version': state['version'], 'state': 'ready' if id in self.processes and not self.processes[id].closed.is_set()
                else 'error' if id in self.errors or state.get('enabled') else 'disabled'} for id, state in self.packages.state.items()]

    def change(self, action, id, consent=False, consent_version=None, consent_digest=None):
        try:
            valid_id(id)
            if action in ('install','enable') and consent is not True:
                raise ValueError('Revisa y acepta los permisos de esta integración.')
            with self.lock:
                if self.changing or (self.current and self.current.get('tool','').split(':')[0] == id):
                    raise ValueError('Hay una operación en curso. Espera a que termine antes de cambiar la integración.')
                self.changing = True
                self.change_id, self.change_action = id, action
            try:
                if action in ('install','enable'):
                    entry = next((item for item in self.catalog if item['id'] == id), None)
                    if not entry or current_platform() not in entry['platforms']:
                        raise ValueError('Esta integración no está disponible para tu computadora.')
                    if consent_version != entry['version'] or consent_digest != (entry.get('package') or {}).get('sha256', ''):
                        raise ValueError('El catálogo cambió. Revisa de nuevo la versión y los permisos antes de continuar.')
                    if action == 'install':
                        if id in self.processes:
                            raise ValueError('Desactiva la integración antes de actualizarla o reinstalarla.')
                        if not entry.get('package'):
                            raise ValueError('El paquete todavía no está publicado. Actualiza el catálogo más adelante.')
                        self.packages.install(entry, self.relay.package(entry))
                        self.errors.pop(id, None)
                        self.message = 'Integración instalada. Revisa los requisitos y pulsa Activar.'
                    else:
                        if id in self.processes and not self.processes[id].closed.is_set():
                            return
                        if self.packages.state[id]['version'] != entry['version']:
                            raise ValueError('Actualiza la integración antes de activarla.')
                        manifest = self.packages.manifest(id)
                        if manifest['permissions'] != entry['permissions'] or manifest['platforms'] != entry['platforms']:
                            raise ValueError('Los permisos cambiaron. Reinstala la integración y revísalos de nuevo.')
                        self.packages.enabled(id, False)
                        setup_package(self.packages, id)
                        process = McpProcess(self.packages, id)
                        process.start()
                        self.processes[id] = process
                        self.packages.enabled(id, True)
                        self.errors.pop(id, None)
                        self.message = 'Integración activa. Abre la aplicación requerida y continúa en tu cliente de IA.'
                elif action in ('disable','uninstall'):
                    process = self.processes.get(id)
                    if process:
                        process.stop()
                        self.processes.pop(id, None)
                    self.packages.enabled(id, False)
                    if action == 'uninstall':
                        self.packages.uninstall(id)
                    self.errors.pop(id, None)
                    self.message = 'Integración desactivada.' if action == 'disable' else 'Integración desinstalada. Tus proyectos se conservaron.'
                else:
                    raise ValueError('Acción no disponible.')
            finally:
                self.changing = False
                self.change_id = self.change_action = ''
        except Exception as error:
            self.errors[id] = str(error)[:400] if isinstance(error, (ValueError, KeyError)) else 'No se pudo completar la acción. Comprueba los requisitos y vuelve a intentarlo.'
            self.message = self.errors[id]

    def work(self, job):
        failed = False
        try:
            uuid.UUID(job['id'])
            id, operation = job['tool'].split(':', 1)
            with self.lock:
                if self.stop.is_set() or not self.active or self.changing or not self.packages.state.get(id, {}).get('enabled'):
                    raise ValueError('La integración está desactivada o cambiando. No se ejecutó la operación.')
                self.packages.validate_operation(id, operation, job['arguments'])
                process = self.processes.get(id)
                if not process:
                    raise ValueError('La integración no está activa.')
                self.current = job
            remaining = min(160, int(job['deadline']) / 1000 - time.time() - 5)
            if remaining <= 0:
                raise ValueError('El trabajo venció. No se ejecutó la operación.')
            result = process.call(operation, job['arguments'], remaining)
            failed = bool(result.get('isError'))
        except Exception as error:
            failed = True
            result = {'message': str(error)[:400] if isinstance(error, ValueError) else 'No se pudo verificar la operación. Comprueba la aplicación antes de repetir cambios.'}
        try:
            # Delivery retry only: a tool call is NEVER replayed by the host.
            for _ in range(3):
                if not self.token or self.stop.is_set():
                    break
                try:
                    self.relay.post('/result', {'jobId': job['id'], 'result': result, 'failed': failed}, self.token)
                    break
                except (OSError, ValueError):
                    if self.stop.wait(2):
                        break
        finally:
            self.current = None
            self.busy = False

    def forget(self):
        self.active = False
        self.token = self.user_code = self.verification_url = ''
        (self.base / 'device.json').unlink(missing_ok=True)
        (self.base / 'consent.json').unlink(missing_ok=True)
        remove_startup()
        for id, process in list(self.processes.items()):
            try:
                process.stop()
                self.processes.pop(id, None)
            except Exception:
                self.errors[id] = 'La integración sigue cerrándose. Cierra Campus Connect antes de volver a activarla.'

    def disconnect(self):
        token = self.token
        self.forget()
        if token:
            try:
                self.relay.post('/disconnect', {}, token)
            except (OSError, ValueError):
                self.message = 'Equipo desactivado localmente. Sin conexión: revócalo también desde tu cliente de IA.'
                return
        self.message = 'Computadora desconectada. Puedes volver a vincularla cuando quieras.'

    def view(self):
        with self.lock:
            return {'active': self.active, 'connected': bool(self.token), 'message': self.message, 'userCode': self.user_code,
                'verificationUrl': self.verification_url, 'catalog': self.catalog, 'catalogError': self.catalog_error,
                'installed': self.health(), 'errors': dict(self.errors), 'changing': self.changing, 'busy': self.busy,
                'changeId': self.change_id, 'changeAction': self.change_action,
                'platform': current_platform(), 'job': {'integrationId': self.current['tool'].split(':')[0], 'operation': self.current['tool'].split(':')[-1]} if self.current else None}


def serve_ui(app):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def valid(self, auth=True):
            expected = '127.0.0.1:' + str(self.server.server_port)
            return self.headers.get('Host') == expected and self.headers.get('Origin', 'http://' + expected) == 'http://' + expected and (not auth or secrets.compare_digest(self.headers.get('Authorization',''), 'Bearer ' + app.session))
        def response(self, code, data, mime='application/json'):
            raw = data if isinstance(data, bytes) else data.encode() if isinstance(data, str) else json.dumps(data).encode()
            self.send_response(code)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(raw)))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
            self.end_headers()
            self.wfile.write(raw)
        def do_GET(self):
            if not self.valid(self.path not in ('/','/campus-logo.webp','/campus.woff2') and not self.path.startswith('/icons/')):
                return self.response(403, {})
            if self.path == '/':
                return self.response(200, (ASSETS / 'ui.html').read_bytes(), 'text/html; charset=utf-8')
            if self.path == '/state':
                return self.response(200, app.view())
            if self.path.startswith('/icons/'):
                try:
                    id = valid_id(self.path.removeprefix('/icons/'))
                    entry = next(item for item in app.catalog if item['id'] == id)
                    if entry['icon'] != '/integrations/connect/icons/' + id + '.png':
                        raise ValueError('Icono no válido.')
                    image = app.relay.request(entry['icon'], max_bytes=1_000_000)
                    return self.response(200, image, 'image/png')
                except Exception:
                    return self.response(404, {})
            if self.path in ('/campus-logo.webp','/campus.woff2'):
                file = ASSETS / self.path[1:]
                if not file.is_file() and not getattr(sys, 'frozen', False):
                    file = ASSETS / 'assets' / self.path[1:]
                if file.is_file():
                    return self.response(200, file.read_bytes(), 'font/woff2' if file.suffix == '.woff2' else 'image/webp' if file.suffix == '.webp' else 'image/png')
            return self.response(404, {})
        def do_POST(self):
            if not self.valid():
                return self.response(403, {})
            try:
                size = int(self.headers.get('Content-Length','0'))
                if not 0 < size <= 2000:
                    return self.response(413, {})
                data = json.loads(self.rfile.read(size))
                if not isinstance(data, dict):
                    return self.response(400, {})
                if self.path == '/connect':
                    if data.get('consent') is not True:
                        return self.response(400, {'error':'Confirma la vinculación de esta computadora.'})
                    threading.Thread(target=app.activate, daemon=True).start()
                elif self.path == '/catalog':
                    threading.Thread(target=app.refresh_catalog, daemon=True).start()
                elif self.path == '/integration':
                    id = valid_id(data.get('id'))
                    if data.get('action') not in ('install','enable','disable','uninstall'):
                        return self.response(400, {})
                    threading.Thread(target=app.change, args=(data['action'], id, data.get('consent'), data.get('consentVersion'), data.get('consentDigest')), daemon=True).start()
                elif self.path == '/folder':
                    directory = app.packages.directory(valid_id(data.get('id')))
                    if sys.platform == 'darwin':
                        subprocess.Popen(['open', str(directory)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    elif sys.platform == 'win32':
                        os.startfile(str(directory))
                elif self.path == '/disconnect':
                    threading.Thread(target=app.disconnect, daemon=True).start()
                elif self.path == '/quit':
                    # Pause without revoking or forgetting local activation.
                    app.active = False
                    app.stop.set()
                else:
                    return self.response(404, {})
                return self.response(200, {'ok':True})
            except (OSError, ValueError, KeyError):
                return self.response(400, {'error':'No se pudo completar la acción.'})
    server = LoopbackServer(('127.0.0.1',0), Handler)
    server.daemon_threads = True
    app.ui_url = 'http://127.0.0.1:' + str(server.server_port) + '/#session=' + app.session
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def restore_stdio(allow_no_pipes=False):
    # PyInstaller windowed Windows apps have no console streams. MCP worker
    # subprocesses receive pipes through STARTUPINFO; reopen those handles only.
    if sys.platform == 'win32' and getattr(sys, 'frozen', False):
        import ctypes
        import msvcrt
        for name, standard, mode in [('stdin',-10,'rb'),('stdout',-11,'wb'),('stderr',-12,'wb')]:
            if getattr(sys, name) is None:
                ctypes.windll.kernel32.GetStdHandle.restype = ctypes.c_void_p
                handle = ctypes.windll.kernel32.GetStdHandle(standard)
                if not handle or handle == ctypes.c_void_p(-1).value:
                    if allow_no_pipes:
                        setattr(sys, name, io.StringIO())
                        continue
                    raise ValueError('No se pudo abrir el canal de la integración.')
                fd = msvcrt.open_osfhandle(handle, os.O_BINARY | (os.O_RDONLY if mode == 'rb' else os.O_WRONLY))
                setattr(sys, name, io.TextIOWrapper(os.fdopen(fd, mode), encoding='utf-8', write_through=True))


def worker(mode, id, base):
    restore_stdio(mode == '--setup-worker')
    sys.dont_write_bytecode = True
    packages = PackageStore(Path(base))
    manifest = packages.manifest(valid_id(id))
    directory = packages.directory(id)
    sys.path.insert(0, str(directory))
    entry = manifest['entrypoint'] if mode == '--plugin-worker' else manifest.get('setup')
    if not entry:
        raise ValueError('El paquete no tiene este componente.')
    sys.argv = [str(directory / entry)]
    runpy.run_path(str(directory / entry), run_name='__main__')


def instance_lock(base):
    private_dir(base)
    handle = (base / 'instance.lock').open('a+b')
    try:
        if sys.platform == 'win32':
            import msvcrt
            if handle.seek(0,2) == 0:
                handle.write(b'0'); handle.flush()
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        return handle
    except OSError:
        handle.close()
        try:
            url = json.loads((base / 'instance.json').read_text())['uiUrl']
            if url.startswith('http://127.0.0.1:'):
                webbrowser.open(url)
        except (OSError, ValueError, KeyError):
            pass
        return None


def main():
    if sys.argv[1:2] in (['--plugin-worker'],['--setup-worker']):
        worker(*sys.argv[1:5]); return
    if '--self-test' in sys.argv:
        from mcp import ClientSession
        from mcp.server import Server
        from jsonschema import Draft202012Validator
        config = json.loads((ASSETS / 'build-config.json').read_text())
        assert config['version'] == VERSION
        Relay(config['relayOrigin'])
        assert 'Mis integraciones' in (ASSETS / 'ui.html').read_text()
        return
    base = BASE
    handle = instance_lock(base)
    if handle is None:
        return
    config = json.loads((ASSETS / 'build-config.json').read_text())
    app = Connect(Relay(config['relayOrigin']), base)
    server = serve_ui(app)
    write_private(base / 'instance.json', {'uiUrl':app.ui_url})
    if '--background' not in sys.argv:
        webbrowser.open(app.ui_url)
    app.refresh_catalog()
    # No automatic setup hooks or reinstalls at login. Only previously enabled,
    # unchanged packages restart, after explicit device consent for this origin.
    try:
        consent = json.loads((base / 'consent.json').read_text())
        if consent.get('relay') == app.relay.origin:
            for id, state in list(app.packages.state.items()):
                if state.get('enabled'):
                    try:
                        process = McpProcess(app.packages, id)
                        process.start()
                        app.processes[id] = process
                    except Exception:
                        app.errors[id] = 'No se pudo iniciar la integración. Comprueba los requisitos y vuelve a activarla.'
            threading.Thread(target=app.activate, daemon=True).start()
    except (OSError, ValueError):
        pass
    try:
        while not app.stop.wait(1):
            pass
    finally:
        for process in list(app.processes.values()):
            process.stop()
        server.shutdown(); server.server_close()
        handle.close()

if __name__ == '__main__':
    internal_mode = any(flag in sys.argv for flag in ('--plugin-worker','--setup-worker','--self-test'))
    try:
        main()
    except Exception:
        if internal_mode:
            raise
        private_dir(BASE)
        error = BASE / 'connection-error.html'
        error.write_text('<meta charset="utf-8"><title>Campus Connect</title><h1>No se pudo abrir Campus Connect</h1><p>Cierra la app y vuelve a intentarlo. Si el problema continúa, descarga la app nuevamente desde Campus.</p>', encoding='utf-8')
        webbrowser.open(error.as_uri())
        raise SystemExit(1)
