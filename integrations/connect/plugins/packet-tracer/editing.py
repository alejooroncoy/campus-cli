"""Reviewed Campus operations over the pinned vendor API, independent of the host."""
import re
from pathlib import Path

from mcp.types import CallToolResult, TextContent


def vendor_operation(name, arguments, workspace):
    args = dict(arguments)
    if name in ('pt_apply_ios_config', 'pt_read_device_config'):
        if name == 'pt_apply_ios_config':
            args['commands'] = ['enable', 'configure terminal', *args['commands'], 'end']
        if name == 'pt_read_device_config':
            args = {'device': args['device'], 'commands': ['enable', 'show ' + args['section']]}
        # A timeout can leave a partial batch. Never retry it automatically.
        return 'pt_cli', {**args, 'timeout': 20.0 if name == 'pt_read_device_config' else 2.0,
                          'auto_confirm': False, 'show': False, 'capture': False}
    if name in ('pt_save_activity', 'pt_save_project'):
        root = Path(workspace).resolve()
        target = root / args['filename']
        if target.parent.resolve() != root or target.exists() or target.is_symlink():
            raise ValueError('Elige un nombre nuevo dentro de Documentos/Campus/PacketTracer.')
        if name == 'pt_save_activity':
            return 'pt_activity_save', {'path': str(target), 'overwrite': False}
        return name, {**args, 'directory': str(root), 'overwrite': False}
    if name == 'pt_host_ip_config':
        args.update(show=False, capture=False)
    return name, args


def checked_result(name, arguments, result, workspace):
    """Retain vendor evidence, marking textual failures as MCP errors."""
    blocks = result[0] if isinstance(result, tuple) else result
    if isinstance(blocks, CallToolResult):
        content = blocks.content
        error = blocks.isError
    else:
        content = list(blocks)
        error = False
    text = '\n'.join(getattr(block, 'text', '') for block in content)
    # Vendor 0.12.0 often returns errors as ordinary text blocks.
    if re.search(r'\[(?:ERROR|TIMEOUT|UNKNOWN COMMAND|WAITING FOR ANSWER)\]|could not use the console|Interrupted:|No answer from PT|PT error|ERR:|Not saved:|PT did not write|"ok"\s*:\s*false', text, re.I):
        error = True
    if name in ('pt_save_activity', 'pt_save_project'):
        target = Path(workspace) / arguments['filename']
        if not target.is_file() or target.is_symlink() or target.stat().st_size == 0:
            error = True
            content.append(TextContent(type='text', text='No se verificó un archivo nuevo con contenido. No se confirma el guardado.'))
    if error:
        return CallToolResult(content=content, isError=True)
    return result
