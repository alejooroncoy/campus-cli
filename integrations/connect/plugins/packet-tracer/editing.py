"""Reviewed Campus operations over the pinned vendor API, independent of the host."""
import re
from pathlib import Path

from mcp.types import CallToolResult, TextContent


def result_text(result):
    blocks = result[0] if isinstance(result, tuple) else result
    if isinstance(blocks, CallToolResult):
        blocks = blocks.content
    return '\n'.join(getattr(block, 'text', '') for block in blocks)


def upstream_failed(result):
    blocks = result[0] if isinstance(result, tuple) else result
    return isinstance(blocks, CallToolResult) and bool(blocks.isError)


async def generate_ssh_keys(call, arguments):
    """Answer only the two known RSA questions; never replace existing keys."""
    fixed = {'device': arguments['device'], 'timeout': 20.0, 'auto_confirm': False, 'show': False, 'capture': False}
    first = await call('pt_cli', {**fixed, 'commands': ['enable', 'configure terminal', 'crypto key generate rsa']})
    text = result_text(first)
    if upstream_failed(first) or re.search(r'\[(?:ERROR|TIMEOUT|UNKNOWN COMMAND)\]', text):
        return first
    existing = bool(re.search(r'replace|already have.*keys', text, re.I))
    if existing:
        answer = 'no'
    elif re.search(r'how many bits|modulus.*\[[0-9]+\]', text, re.I):
        answer = str(arguments['bits'])
    else:
        # No guessed answers if Cisco returned a different prompt.
        return CallToolResult(content=[TextContent(type='text', text=text + '\nNo se reconoció la pregunta de RSA; inspeccionar la consola antes de continuar.')], isError=True)
    second = await call('pt_cli', {**fixed, 'commands': [answer, 'end', 'show ip ssh']})
    final = result_text(second)
    enabled = not upstream_failed(second) and bool(re.search(r'SSH Enabled', final, re.I))
    expected = text.replace('[WAITING FOR ANSWER]', '[EXPECTED RSA QUESTION]')
    return CallToolResult(content=[TextContent(type='text', text=expected + '\n' + final +
        ('\nSe conservaron las claves existentes.' if existing else '\nSe comprobó el estado SSH después de generar las claves.'))], isError=not enabled)


def vendor_operation(name, arguments, workspace):
    args = dict(arguments)
    if name in ('pt_apply_ios_config', 'pt_apply_security_config', 'pt_read_device_config', 'pt_save_device_config'):
        if name in ('pt_apply_ios_config', 'pt_apply_security_config'):
            args['commands'] = ['enable', 'configure terminal', *args['commands'], 'end']
        if name == 'pt_read_device_config':
            args = {'device': args['device'], 'commands': ['enable', 'show ' + args['section']]}
        if name == 'pt_save_device_config':
            args = {'device': args['device'], 'commands': ['enable', 'write memory']}
        # A timeout can leave a partial batch. Never retry it automatically.
        return 'pt_cli', {**args, 'timeout': 20.0 if name in ('pt_read_device_config', 'pt_save_device_config') else 2.0,
                          'auto_confirm': False, 'show': False, 'capture': False}
    if name in ('pt_save_activity', 'pt_save_project'):
        root = Path(workspace).resolve()
        target = root / args['filename']
        if target.parent.resolve() != root or target.exists() or target.is_symlink():
            raise ValueError('Elige un nombre nuevo dentro de Documentos/Campus/PacketTracer.')
        if name == 'pt_save_activity':
            return 'pt_activity_save', {'path': str(target), 'overwrite': False}
        return name, {**args, 'directory': str(root), 'overwrite': False}
    if name == 'pt_reopen_activity':
        root = Path(workspace).resolve()
        target = root / args['filename']
        if target.parent.resolve() != root or target.is_symlink() or not target.is_file():
            raise ValueError('La actividad debe existir en Documentos/Campus/PacketTracer.')
        return 'pt_activity_open', {'path': str(target), 'password': ''}
    if name == 'pt_host_ip_config':
        args.update(show=False, capture=False)
    if name in ('pt_server_dhcp', 'pt_server_dns', 'pt_server_http'):
        args.setdefault('enable', None)
        args.update(show=False, capture=False)
    if name == 'pt_web_check':
        return 'pt_web_browser', {'device': args['device'], 'url': 'http://' + args['host'] + '/', 'timeout': 12.0, 'show': False, 'capture': False}
    if name == 'pt_host_lookup':
        return 'pt_host_command', {'device': args['device'], 'command': 'nslookup ' + args['name'], 'timeout': 12.0, 'show': False, 'capture': False}
    if name == 'pt_ssh_test':
        return 'pt_host_command', {'device': args['device'], 'command': 'ssh -l ' + args['username'] + ' ' + args['to_ip'],
                                   'inputs': [args['password'], 'show privilege', 'exit'], 'timeout': 15.0, 'show': False, 'capture': False}
    if name == 'pt_wireless_ap':
        args.setdefault('reset_associations', bool(args.get('ssid') or 'broadcast' in args))
    return name, args


def checked_result(name, arguments, result, workspace):
    """Retain vendor evidence, marking textual failures as MCP errors."""
    secrets = [arguments['password']] if name == 'pt_ssh_test' else []
    if name == 'pt_apply_security_config':
        secrets += [line.split(' secret ', 1)[1] for line in arguments['commands'] if ' secret ' in line]
    authenticated = name == 'pt_ssh_test' and bool(re.search(r'Current privilege level is [0-9]+', result_text(result), re.I))
    def redact(value):
        if isinstance(value, str):
            for secret in secrets:
                value = value.replace(secret, '[REDACTED]')
            if authenticated:
                value = value.replace('[WAITING FOR ANSWER]', '[EXPECTED AUTH PROMPT]')
            return value
        if isinstance(value, dict):
            return {k: redact(v) for k, v in value.items()}
        if isinstance(value, list):
            return [redact(v) for v in value]
        return value
    if secrets:
        # FastMCP may repeat output in structuredContent: redact both surfaces.
        blocks = result[0] if isinstance(result, tuple) else result
        if isinstance(blocks, CallToolResult):
            result = CallToolResult(**redact(blocks.model_dump()))
        else:
            blocks = [TextContent(type='text', text=redact(b.text)) if isinstance(b, TextContent) else b for b in blocks]
            result = (blocks, redact(result[1])) if isinstance(result, tuple) else blocks
    blocks = result[0] if isinstance(result, tuple) else result
    if isinstance(blocks, CallToolResult):
        content = blocks.content
        error = blocks.isError
    else:
        content = list(blocks)
        error = False
    text = '\n'.join(getattr(block, 'text', '') for block in content)
    # Vendor 0.12.0 often returns errors as ordinary text blocks.
    if re.search(r'\A(?:Validation failed:|Error:)|\[(?:ERROR|TIMEOUT|UNKNOWN COMMAND|WAITING FOR ANSWER)\]|could not use the console|Interrupted:|No answer from PT|Packet Tracer is not connected|PT error|ERR:|Not saved:|PT did not write|"ok"\s*:\s*false', text, re.I):
        error = True
    if name in ('pt_save_activity', 'pt_save_project'):
        target = Path(workspace) / arguments['filename']
        if not target.is_file() or target.is_symlink() or target.stat().st_size == 0:
            error = True
            content.append(TextContent(type='text', text='No se verificó un archivo nuevo con contenido. No se confirma el guardado.'))
    if error:
        return CallToolResult(content=content, isError=True)
    return result
