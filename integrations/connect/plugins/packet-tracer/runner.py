"""Campus's allowlisted MCP facade around Mats2208/packet-tracer-mcp 0.12.0.

Runs only inside Connect's generic stdio supervisor. This adapter keeps the
vendor-specific bridge and project-path policy out of the Campus host.
"""
import asyncio
import json
import os
from pathlib import Path
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool
from jsonschema import Draft202012Validator

ROOT = Path(__file__).parent
WORKSPACE = Path(os.environ['CAMPUS_WORKSPACE'])
WORKSPACE.mkdir(parents=True, exist_ok=True)
os.environ['PT_MCP_WORKDIR'] = str(WORKSPACE)
os.chdir(WORKSPACE)
from connect_common import LoopbackServer
from packet_tracer_mcp.infrastructure.execution import live_bridge
# Do not reverse-resolve 127.0.0.1 while starting the frozen local bridge.
live_bridge.ThreadingHTTPServer = LoopbackServer
from packet_tracer_mcp.server import mcp, BRIDGE

policy = {tool['name']: tool for tool in json.loads((ROOT / 'policy.json').read_text(encoding='utf-8'))['tools']}
server = Server('campus-packet-tracer', version='0.12.0')

@server.list_tools()
async def tools():
    return [Tool(name=tool['name'], description='Operación de laboratorio de Packet Tracer.', inputSchema=tool['inputSchema']) for tool in policy.values()]

@server.call_tool()
async def call(name, arguments):
    if name not in policy or len(json.dumps(arguments).encode()) > 100_000:
        raise ValueError('Operación no habilitada.')
    Draft202012Validator(policy[name]['inputSchema']).validate(arguments)
    if name == 'pt_save_project':
        arguments = {**arguments, 'directory': str(WORKSPACE), 'overwrite': False}
    if name == 'pt_full_build' and arguments.get('deploy', True) and BRIDGE.check_bridge():
        raise ValueError('Packet Tracer no está conectado. Abre MCP Control Center antes de crear la red.')
    result = await mcp.call_tool(name, arguments)
    # FastMCP returns content blocks or (content, structured data).
    if isinstance(result, tuple):
        return result
    return result

async def main():
    BRIDGE.ensure_bridge(grace=False)
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())

asyncio.run(main())
