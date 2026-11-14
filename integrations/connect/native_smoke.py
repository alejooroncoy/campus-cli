"""Exercise the frozen host's stdio pipes and real downloaded plugin on each OS."""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile
from unittest.mock import patch
from connect_packages import PackageStore
from connect_runtime import McpProcess

parser=argparse.ArgumentParser()
parser.add_argument('--binary',type=Path,required=True)
parser.add_argument('--artifacts',type=Path,required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[2]
entry=json.loads((root/'src/cloud/connect/catalog.json').read_text(encoding='utf-8'))[0]
package=args.artifacts/'plugins/packet-tracer/campus-connect-plugin-packet-tracer-0.2.0-any.zip'
data=package.read_bytes()
entry['package']={'size':len(data),'sha256':hashlib.sha256(data).hexdigest()}
with tempfile.TemporaryDirectory(prefix='campus-connect-native-smoke-') as base:
    store=PackageStore(Path(base))
    store.install(entry,data)
    process=McpProcess(store,'packet-tracer')
    with patch('connect_runtime.command',side_effect=lambda *values:[str(args.binary.resolve()),*values]):
        try:
            process.start()
            result=process.call('pt_get_device_details',{'model_name':'2960-24TT'},20)
            assert not result.get('isError') and 'FastEthernet0/1' in str(result)
        finally:
            process.stop()
    assert process.closed.is_set()
print('Native host + separate real MCP package: passed')
