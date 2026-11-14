"""A supervised stdio MCP process per active integration; never shell commands."""
from __future__ import annotations
import asyncio
import concurrent.futures
from datetime import timedelta
import json
import os
from pathlib import Path
import subprocess
import threading
from connect_common import command, private_dir

class McpProcess:
    def __init__(self, packages, id):
        self.packages, self.id = packages, id
        self.ready = threading.Event()
        self.closed = threading.Event()
        self.loop = self.session = self.exit_event = self.task = None
        self.error = ''
        self.thread = threading.Thread(target=self._thread_main, daemon=True)

    def start(self, timeout=30):
        self.thread.start()
        if not self.ready.wait(timeout) or self.error or self.closed.is_set():
            self.stop()
            raise ValueError('El MCP no pudo iniciarse. Revisa sus requisitos y vuelve a activarlo.')

    def _thread_main(self):
        try:
            asyncio.run(self._run())
        except asyncio.CancelledError:
            pass
        except Exception:
            self.error = 'La integración se detuvo. Desactívala y vuelve a activarla.'
        finally:
            self.closed.set()
            self.ready.set()

    async def _run(self):
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client
        self.loop = asyncio.get_running_loop()
        self.task = asyncio.current_task()
        self.exit_event = asyncio.Event()
        manifest = self.packages.manifest(self.id)
        workspace = Path.home() / 'Documents' / 'Campus' / manifest['workspace']
        campus = workspace.parent
        if campus.is_symlink() or workspace.is_symlink():
            raise ValueError('La carpeta de proyectos no puede ser un enlace a otra carpeta.')
        private_dir(workspace)
        cmd = command('--plugin-worker', self.id, str(self.packages.base))
        env = {'PYTHONNOUSERSITE': '1', 'PYTHONDONTWRITEBYTECODE': '1', 'CAMPUS_WORKSPACE': str(workspace)}
        parameters = StdioServerParameters(command=cmd[0], args=cmd[1:], cwd=str(workspace), env=env)
        with open(os.devnull, 'w') as errlog:
            async with stdio_client(parameters, errlog=errlog) as (read, write):
                async with ClientSession(read, write, read_timeout_seconds=timedelta(seconds=165)) as session:
                    await session.initialize()
                    tools = await session.list_tools()
                    policy = json.loads((self.packages.directory(self.id) / 'policy.json').read_text(encoding='utf-8'))
                    expected = {tool['name']: tool['inputSchema'] for tool in policy['tools']}
                    actual = {tool.name: tool.inputSchema for tool in tools.tools}
                    if expected != actual or tools.nextCursor:
                        raise ValueError('El catálogo MCP no coincide con el paquete verificado.')
                    self.session = session
                    self.ready.set()
                    await self.exit_event.wait()
                    self.session = None

    def call(self, operation, args, timeout):
        if not self.ready.is_set() or self.closed.is_set() or not self.session:
            raise ValueError('La integración no está activa.')
        self.packages.validate_operation(self.id, operation, args)
        future = asyncio.run_coroutine_threadsafe(self.session.call_tool(operation, args), self.loop)
        try:
            result = future.result(timeout=timeout)
            data = result.model_dump(mode='json', exclude_none=True)
            if len(json.dumps(data).encode()) > 1_500_000:
                raise ValueError('El resultado excede el tamaño permitido; no se pudo confirmar su contenido.')
            return data
        except concurrent.futures.TimeoutError:
            future.cancel()
            self.stop()
            raise ValueError('Tiempo agotado; puede haber cambios aplicados. Comprueba la aplicación antes de repetir.') from None
        except Exception:
            self.stop()
            raise

    def stop(self):
        if self.loop and self.exit_event and not self.closed.is_set():
            try:
                self.loop.call_soon_threadsafe(self.task.cancel)
            except RuntimeError:
                pass
        if self.thread.is_alive() and threading.current_thread() != self.thread:
            self.thread.join(timeout=8)
        if self.thread.is_alive():
            raise ValueError('El MCP sigue cerrándose. Espera antes de volver a activarlo.')


def setup_package(packages, id):
    manifest = packages.manifest(id)
    if not manifest.get('setup'):
        return {'state': 'ready'}
    # Setup code belongs to the same reviewed package. No relay token or campus
    # cookie is given to the subprocess; its stdout contains only setup status.
    from mcp.client.stdio import get_default_environment
    process = subprocess.run(command('--setup-worker', id, str(packages.base)), capture_output=True,
        timeout=140, env=get_default_environment())
    if len(process.stdout) > 4000 or process.returncode:
        raise ValueError('No se pudo preparar la integración. Comprueba la aplicación requerida y vuelve a intentarlo.')
    result = json.loads(process.stdout)
    if result.get('state') != 'ready':
        raise ValueError(str(result.get('message', 'Falta completar la preparación de esta integración.'))[:400])
    return result
