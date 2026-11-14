import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch, Mock
import urllib.request
import urllib.error
import uuid
import zipfile

sys.path.insert(0, str(Path(__file__).parent))
from connect_packages import PackageStore, validate_manifest, relative_file
from connect_common import Relay
from connect_runtime import McpProcess
from app import Connect, serve_ui

ROOT = Path(__file__).resolve().parents[2]

def archive(entry, files, mutate=None):
    manifest = {'format':'campus-integration-v1','hostApi':1,'runtime':'python-mcp','id':entry['id'],'version':entry['version'],
        'entrypoint':'runner.py','workspace':'CampusConnectTest','permissions':entry['permissions'],'platforms':entry['platforms'],
        'files':{name:hashlib.sha256(data).hexdigest() for name,data in files.items()}}
    if mutate:
        mutate(manifest)
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w',zipfile.ZIP_DEFLATED) as zipped:
        for name,data in files.items():
            zipped.writestr(name,data)
        zipped.writestr('manifest.json',json.dumps(manifest))
    data=stream.getvalue()
    entry={**entry,'package':{'size':len(data),'sha256':hashlib.sha256(data).hexdigest(),'url':'/integrations/connect/packages/'+entry['id']+'/fixture.zip','fileName':'fixture.zip'}}
    return entry,data

FIXTURE_RUNNER=b'''import asyncio,json\nfrom pathlib import Path\nfrom mcp.server import Server\nfrom mcp.server.stdio import stdio_server\nfrom mcp.types import Tool,TextContent\nserver=Server('fixture')\n@server.list_tools()\nasync def tools():\n return [Tool(name='echo',inputSchema={"type":"object","properties":{"text":{"type":"string"}},"required":["text"],"additionalProperties":False})]\n@server.call_tool()\nasync def call(name,arguments):\n return [TextContent(type='text',text=arguments['text'])]\nasync def main():\n async with stdio_server() as (read,write):\n  await server.run(read,write,server.create_initialization_options())\nasyncio.run(main())\n'''
FIXTURE_POLICY={'tools':[{'name':'echo','inputSchema':{'type':'object','properties':{'text':{'type':'string'}},'required':['text'],'additionalProperties':False}}]}

class ConnectTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='campus-connect-test-')
        self.base=Path(self.temp.name).resolve()
        self.store=PackageStore(self.base)
        self.entry={'id':'fixture','version':'0.2.0','permissions':['Echo test input'],'platforms':['macos-arm64','macos-x64','windows-x64']}
        self.entry,self.data=archive(self.entry,{'runner.py':FIXTURE_RUNNER,'policy.json':json.dumps(FIXTURE_POLICY).encode()})
    def tearDown(self):
        self.temp.cleanup()

    def test_package_archive_uses_platform_independent_order_and_bytes(self):
        from build import make_archive
        names=['Z.txt','a.txt','nested/UPPER.txt','nested/lower.txt']
        outputs=[]
        for index,order in enumerate([names,list(reversed(names))]):
            folder=self.base/('source-'+str(index));folder.mkdir()
            for name in order:
                file=folder/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(name.encode())
            output=self.base/('archive-'+str(index)+'.zip');make_archive(folder,output)
            with zipfile.ZipFile(output) as packaged:
                self.assertEqual(packaged.namelist(),sorted(names))
            outputs.append(output.read_bytes())
        self.assertEqual(outputs[0],outputs[1])

    def test_install_is_verified_and_tampering_prevents_execution(self):
        self.store.install(self.entry,self.data)
        self.assertFalse(self.store.state['fixture']['enabled'])
        self.store.enabled('fixture',True)
        file=self.store.directory('fixture')/'runner.py'
        file.write_text('tampered')
        with self.assertRaises(ValueError):
            self.store.manifest('fixture')
        self.store.enabled('fixture',False)
        self.store.uninstall('fixture')
        self.assertNotIn('fixture',self.store.state)

    def test_checksum_permissions_inventory_and_failed_update_keep_installed_version(self):
        self.store.install(self.entry,self.data)
        bad={**self.entry,'version':'0.3.0'}
        for entry,data in [(self.entry,self.data+b'changed'),archive(bad,{'runner.py':b'code','policy.json':b'{}'},lambda m:m.update(permissions=['other'])),archive(bad,{'runner.py':b'code','policy.json':b'{}'},lambda m:m['files'].update({'missing.py':'0'*64}))]:
            with self.assertRaises(ValueError):
                self.store.install(entry,data)
            self.assertEqual(self.store.manifest('fixture')['version'],'0.2.0')

    def test_no_traversal_symlinks_extra_or_case_colliding_files(self):
        for name in ('../outside','/outside','a/../outside','C:/Windows/file','a\\b','a//b','./file'):
            with self.assertRaises(ValueError):
                relative_file(name)
        for name in ('../outside','RUNNER.PY'):
            entry,data=archive(self.entry,{'runner.py':FIXTURE_RUNNER,'policy.json':b'{}',name:b'x'})
            with self.assertRaises(ValueError):
                self.store.install(entry,data)
        self.store.install(self.entry,self.data)
        (self.store.directory('fixture')/'extra.py').write_text('extra')
        with self.assertRaises(ValueError):
            self.store.manifest('fixture')

    def test_arbitrary_second_mcp_uses_the_same_runtime_and_stops(self):
        self.store.install(self.entry,self.data)
        process=McpProcess(self.store,'fixture')
        try:
            process.start()
            self.assertIn('hello',str(process.call('echo',{'text':'hello'},10)))
            with self.assertRaises(ValueError):
                process.call('shell',{},10)
        finally:
            process.stop()
        self.assertTrue(process.closed.is_set())

    def test_real_packet_tracer_package_runs_separately_from_host(self):
        package=Path(os.environ.get('CONNECT_TEST_ARTIFACT_DIR', str(ROOT/'.tmp/connect-release')))/'plugins/packet-tracer/campus-connect-plugin-packet-tracer-0.2.0-any.zip'
        if not package.exists():
            self.skipTest('Build the pinned plugin before this offline integration check.')
        entry=json.loads((ROOT/'src/cloud/connect/catalog.json').read_text())[0]
        data=package.read_bytes()
        entry['package']={'size':len(data),'sha256':hashlib.sha256(data).hexdigest()}
        self.store.install(entry,data)
        process=McpProcess(self.store,'packet-tracer')
        try:
            process.start()
            result=process.call('pt_get_device_details',{'model_name':'2960-24TT'},20)
            self.assertIn('FastEthernet0/1',str(result))
            self.assertFalse(result.get('isError'))
            with self.assertRaises(Exception):
                self.store.validate_operation('packet-tracer','pt_save_project',{'filename':'../escape.pkt'})
        finally:
            process.stop()

    def test_disabled_integration_cannot_execute_or_retry_a_mutation(self):
        self.store.install(self.entry,self.data)
        relay=Mock(origin='https://campus.example.test')
        app=Connect(relay,self.base); app.active=True; app.token='device-token'; app.busy=True
        app.work({'id':str(uuid.uuid4()),'tool':'fixture:echo','arguments':{'text':'hello'},'deadline':int((time.time()+30)*1000)})
        relay.post.assert_called_once()
        self.assertTrue(relay.post.call_args.args[1]['failed'])
        self.assertNotIn('device-token',json.dumps(app.view()))

    def test_local_ui_rejects_unauthenticated_cross_origin_and_foreign_host(self):
        app=Connect(Relay('https://campus.example.test'),self.base)
        with patch('socket.getfqdn',side_effect=AssertionError('No reverse DNS for loopback UI')):
            server=serve_ui(app)
        origin='http://127.0.0.1:'+str(server.server_port)
        try:
            for headers in ({},{'Authorization':'Bearer '+app.session,'Origin':'https://foreign.test'},{'Authorization':'Bearer '+app.session,'Host':'foreign.test'}):
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(urllib.request.Request(origin+'/state',headers=headers))
                self.assertEqual(error.exception.code,403)
            with urllib.request.urlopen(urllib.request.Request(origin+'/state',headers={'Authorization':'Bearer '+app.session})) as response:
                self.assertFalse(json.load(response)['connected'])
            with urllib.request.urlopen(origin) as response:
                markup=response.read().decode()
            self.assertNotIn(app.session,markup)
            self.assertIn('Mis integraciones',markup)
            request=urllib.request.Request(origin+'/connect',data=b'{}',headers={'Authorization':'Bearer '+app.session,'Content-Type':'application/json'})
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(request)
            self.assertEqual(error.exception.code,400)
        finally:
            server.shutdown();server.server_close()

    def test_package_download_never_redirects_or_sends_device_credentials(self):
        relay=Relay('https://campus.example.test')
        with patch.object(relay,'request',return_value=self.data) as request:
            relay.package(self.entry)
            self.assertNotIn('token',request.call_args.kwargs)
        for value in ('https://evil.test/pkg','//evil.test/pkg','/other/fixture.zip'):
            entry={**self.entry,'package':{**self.entry['package'],'url':value}}
            with self.assertRaises(ValueError):
                relay.package(entry)
        for origin in ('http://evil.test','https://a:b@campus.test','https://campus.test/other'):
            with self.assertRaises(ValueError):
                Relay(origin)

    def test_permission_consent_cannot_install_a_changed_package(self):
        relay=Mock(origin='https://campus.example.test')
        app=Connect(relay,self.base);app.catalog=[self.entry]
        app.change('install','fixture',True,'0.2.0','0'*64)
        self.assertIn('catálogo cambió',app.errors['fixture'])
        relay.package.assert_not_called()
        self.assertNotIn('fixture',app.packages.state)

    def test_hung_mcp_initialization_is_stopped_without_a_leaked_process(self):
        entry,data=archive(self.entry,{'runner.py':b'import time; time.sleep(60)','policy.json':json.dumps(FIXTURE_POLICY).encode()})
        self.store.install(entry,data)
        process=McpProcess(self.store,'fixture')
        with self.assertRaises(ValueError):
            process.start(timeout=0.1)
        self.assertTrue(process.closed.is_set())
        self.assertFalse(process.thread.is_alive())

    def test_cached_catalog_keeps_installed_integrations_manageable_offline(self):
        relay=Mock(origin='https://campus.example.test')
        relay.catalog.return_value={'integrations':[{**self.entry,'name':'Fixture'}]}
        app=Connect(relay,self.base);app.refresh_catalog()
        self.store.install(self.entry,self.data)
        relay.catalog.side_effect=OSError('offline')
        offline=Connect(relay,self.base);offline.refresh_catalog()
        self.assertEqual(offline.view()['catalog'][0]['id'],'fixture')
        self.assertTrue(offline.view()['catalogError'])
        offline.change('uninstall','fixture')
        self.assertEqual(offline.packages.state,{})

    def test_disconnect_forgets_local_credentials_even_when_relay_is_down(self):
        relay=Mock(origin='https://campus.example.test');relay.post.side_effect=OSError('offline')
        app=Connect(relay,self.base);app.token='secret';app.active=True
        (self.base/'device.json').write_text('{}');(self.base/'consent.json').write_text('{}')
        with patch('app.remove_startup'):
            app.disconnect()
        self.assertFalse(app.active);self.assertEqual(app.token,'')
        self.assertFalse((self.base/'device.json').exists());self.assertFalse((self.base/'consent.json').exists())
        self.assertIn('revócalo',app.message)

if __name__=='__main__':
    unittest.main()
