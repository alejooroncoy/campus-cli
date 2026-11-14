"""Versioned curated packages. Checksums are rooted in the compiled HTTPS relay.

This is integrity checking and a reviewed catalogue, not an OS sandbox. A local
MCP runs with the current user's privileges. Never import arbitrary URLs/MCPBs.
"""
from __future__ import annotations
import hashlib
import io
import json
import re
import shutil
import stat
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from connect_common import private_dir, write_private

ID = re.compile(r'^[a-z][a-z0-9-]{0,63}$')
VERSION = re.compile(r'^\d+\.\d+\.\d+$')
PLATFORMS = ('macos-arm64','macos-x64','windows-x64')

def valid_id(value):
    if not isinstance(value, str) or not ID.fullmatch(value):
        raise ValueError('Identificador de integración inválido.')
    return value

def valid_version(value):
    if not isinstance(value, str) or not VERSION.fullmatch(value):
        raise ValueError('Versión de integración inválida.')
    return value

def relative_file(value):
    if not isinstance(value, str) or len(value) > 240 or '\\' in value or ':' in value:
        raise ValueError('Ruta de paquete inválida.')
    path = PurePosixPath(value)
    for part in path.parts:
        if part.endswith((' ', '.')) or re.fullmatch(r'(?i)(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?', part):
            raise ValueError('Nombre de archivo no compatible con Windows.')
    if path.is_absolute() or not path.parts or any(part in ('.','..') for part in path.parts) or str(path) != value:
        raise ValueError('Ruta de paquete inválida.')
    return value

def validate_manifest(manifest):
    valid_id(manifest['id']); valid_version(manifest['version'])
    if manifest.get('format') != 'campus-integration-v1' or manifest.get('runtime') != 'python-mcp':
        raise ValueError('Formato o runtime de integración no compatible.')
    if manifest.get('hostApi') != 1:
        raise ValueError('Esta integración requiere otra API de Campus Connect.')
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9-]{0,63}', manifest.get('workspace', '')):
        raise ValueError('Carpeta de proyectos no válida.')
    relative_file(manifest['entrypoint'])
    if manifest.get('setup'):
        relative_file(manifest['setup'])
    files = manifest.get('files')
    if not isinstance(files, dict) or not 1 <= len(files) <= 3000:
        raise ValueError('El paquete no contiene un inventario válido.')
    folded = set()
    for name, digest in files.items():
        relative_file(name)
        if name.casefold() in folded or name == 'manifest.json' or not isinstance(digest, str) or not re.fullmatch('[a-f0-9]{64}', digest):
            raise ValueError('El inventario del paquete no es válido.')
        folded.add(name.casefold())
    if manifest['entrypoint'] not in files or (manifest.get('setup') and manifest['setup'] not in files) or 'policy.json' not in files:
        raise ValueError('Faltan componentes de la integración.')
    return manifest

class PackageStore:
    def __init__(self, base):
        self.base = base.resolve()
        self.root = self.base / 'integrations'
        private_dir(self.root)
        self.state_path = self.base / 'integrations.json'
        try:
            self.state = json.loads(self.state_path.read_text(encoding='utf-8'))
            if not isinstance(self.state, dict):
                raise ValueError('Estado inválido.')
            for key, value in self.state.items():
                valid_id(key); valid_version(value['version'])
        except FileNotFoundError:
            self.state = {}

    def save(self):
        write_private(self.state_path, self.state)

    def directory(self, id, version=None):
        valid_id(id)
        version = valid_version(version or self.state[id]['version'])
        result = self.root / id / version
        # A replaced symlink must never redirect imports or uninstall elsewhere.
        if result.resolve() != result.absolute():
            raise ValueError('La carpeta de integración no es válida.')
        return result

    def manifest(self, id):
        directory = self.directory(id)
        manifest = validate_manifest(json.loads((directory / 'manifest.json').read_text(encoding='utf-8')))
        if manifest['id'] != id or manifest['version'] != self.state[id]['version']:
            raise ValueError('La integración instalada no coincide con su registro.')
        # The manifest itself is pinned at installation, not trusted from disk.
        if hashlib.sha256((directory / 'manifest.json').read_bytes()).hexdigest() != self.state[id]['manifestSha256']:
            raise ValueError('El manifiesto instalado cambió. Reinstala la integración.')
        expected = set(manifest['files']) | {'manifest.json'}
        actual = set()
        for file in directory.rglob('*'):
            if file.is_symlink():
                raise ValueError('La integración contiene un enlace no permitido.')
            if file.is_file():
                name = file.relative_to(directory).as_posix()
                actual.add(name)
                if name != 'manifest.json' and hashlib.sha256(file.read_bytes()).hexdigest() != manifest['files'].get(name):
                    raise ValueError('La integración cambió. Reinstálala antes de activarla.')
        if expected != actual:
            raise ValueError('El inventario instalado cambió. Reinstala la integración.')
        return manifest

    def install(self, entry, data):
        id, version = valid_id(entry['id']), valid_version(entry['version'])
        package = entry.get('package') or {}
        if len(data) != package.get('size') or hashlib.sha256(data).hexdigest() != package.get('sha256'):
            raise ValueError('La descarga no coincide con el catálogo de Campus.')
        # Extract into a disposable private directory, then atomically switch
        # the selected version. Failed updates keep the previous selection.
        with tempfile.TemporaryDirectory(prefix='install-', dir=self.root) as temporary:
            stage = Path(temporary)
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                infos = archive.infolist()
                if not 1 <= len(infos) <= 3001 or sum(info.file_size for info in infos) > 200_000_000:
                    raise ValueError('El paquete excede los límites de instalación.')
                names = set()
                for info in infos:
                    name = relative_file(info.filename)
                    if name.casefold() in names or info.is_dir() or stat.S_ISLNK(info.external_attr >> 16) or info.flag_bits & 1:
                        raise ValueError('El paquete contiene archivos no permitidos.')
                    names.add(name.casefold())
                    target = stage / name
                    private_dir(target.parent)
                    with archive.open(info) as source, target.open('xb') as output:
                        shutil.copyfileobj(source, output)
                    target.chmod(0o600)
            raw = (stage / 'manifest.json').read_bytes()
            manifest = validate_manifest(json.loads(raw))
            if manifest['id'] != id or manifest['version'] != version:
                raise ValueError('El paquete no coincide con la integración solicitada.')
            if manifest.get('permissions') != entry['permissions'] or manifest.get('platforms') != entry['platforms']:
                raise ValueError('Los permisos o plataformas no coinciden con el catálogo.')
            actual = {file.relative_to(stage).as_posix() for file in stage.rglob('*') if file.is_file()}
            if actual != set(manifest['files']) | {'manifest.json'}:
                raise ValueError('El inventario del paquete está incompleto.')
            for name, expected in manifest['files'].items():
                if hashlib.sha256((stage / name).read_bytes()).hexdigest() != expected:
                    raise ValueError('Un archivo del paquete no pasó la verificación.')
            destination = self.directory(id, version)
            private_dir(destination.parent)
            if destination.exists():
                # An inactive same-version repair never deletes the only good
                # copy until all new bytes have been verified.
                shutil.rmtree(destination)
            stage.replace(destination)
            self.state[id] = {'version': version, 'enabled': False, 'manifestSha256': hashlib.sha256(raw).hexdigest()}
            self.save()
        return manifest

    def enabled(self, id, value):
        valid_id(id)
        if value:
            self.manifest(id)
        self.state[id]['enabled'] = bool(value)
        self.save()

    def uninstall(self, id):
        directory = self.directory(id)
        # Keep user-created projects. Remove only our versioned package folder.
        shutil.rmtree(directory.parent, ignore_errors=False)
        self.state.pop(id)
        self.save()

    def validate_operation(self, id, operation, args):
        from jsonschema import Draft202012Validator
        manifest = self.manifest(id)
        policy = json.loads((self.directory(id) / 'policy.json').read_text(encoding='utf-8'))
        tool = next((tool for tool in policy['tools'] if tool['name'] == operation), None)
        if not tool or not isinstance(args, dict) or len(json.dumps(args).encode()) > 100_000:
            raise ValueError('Operación no habilitada.')
        Draft202012Validator(tool['inputSchema']).validate(args)
        return manifest
