"""Bounded layout writes using Cisco's documented logical-workspace API."""
import asyncio
import json

from mcp.types import CallToolResult, TextContent

OPERATIONS = ('pt_move_device', 'pt_move_note')


def move_script(name, arguments):
    if name not in OPERATIONS:
        raise ValueError('Operación de posición no habilitada.')
    config = {**arguments, 'kind': 'device' if name == 'pt_move_device' else 'note'}
    return r'''(function(){var w=null,previous=null,changed=false;
var out={ok:false,verified:false,mutationAttempted:false};try{
var c=CONFIG,n=ipc.network();w=ipc.appWindow().getActiveWorkspace().getLogicalWorkspace();
previous=w.getCurrentCluster();out.originalCluster={id:String(previous.getId()),name:String(previous.getName())};
var clusters=[],seen=Object.create(null);
function walk(x,depth){if(depth>20||clusters.length>=100)throw 'cluster_limit';
var id=String(x.getId());if(seen[id])throw 'cluster_cycle';seen[id]=true;
clusters.push({id:id,name:String(x.getName())});
for(var i=0;i<x.getChildClusterCount();i++)walk(x.getChildClusterAt(i),depth+1);}
walk(w.getRootCluster(),0);var matches=clusters.filter(function(x){return x.name===c.cluster;});
if(matches.length!==1)throw 'cluster_missing_or_ambiguous';var cluster=matches[0];out.cluster=cluster;
out.countsBefore={devices:n.getDeviceCount(),links:n.getLinkCount()};
if(out.countsBefore.devices>1000||out.countsBefore.links>2000)throw 'inventory_limit';
var device=null,item=null;
function read(){if(c.kind==='device'){
return {x:Number(device.getXCoordinate()),y:Number(device.getYCoordinate()),
clusterId:String(item.getClusterID()),name:String(device.getName()),model:String(device.getModel())};}
return {x:Number(w.getCanvasItemRealX(c.note_id)),y:Number(w.getCanvasItemRealY(c.note_id)),
clusterId:String(w.getClusterIdForItem(c.note_id)),text:String(w.getCanvasNoteText(c.note_id))};}
if(c.kind==='device'){var count=0;
for(var i=0;i<out.countsBefore.devices;i++){var d=n.getDeviceAt(i);
if(String(d.getName())===c.device_name){count++;device=d;}}
if(count!==1)throw 'device_missing_or_ambiguous';
if(String(device.getModel())==='Power Distribution Device')throw 'not_a_logical_network_device';
item=w.getComponentItem(c.device_name);if(!item)throw 'component_missing';
out.target={kind:'device',device_name:c.device_name};
}else{var ids=w.getCanvasNoteIds();if(ids.length>10000)throw 'note_limit';var found=0;
for(var i=0;i<ids.length;i++)if(String(ids[i])===c.note_id)found++;
if(found!==1)throw 'note_missing_or_ambiguous';out.target={kind:'note',note_id:c.note_id};}
out.before=read();if(out.before.clusterId!==cluster.id)throw 'target_outside_cluster';
if(out.before.x!==c.expected_position.x||out.before.y!==c.expected_position.y)throw 'stale_position';
if(c.kind==='note'&&out.before.text!==c.expected_text)throw 'stale_note_text';
if(String(previous.getId())!==cluster.id){changed=true;w.showClusterContents(cluster.id);}
if(String(w.getCurrentCluster().getId())!==cluster.id)throw 'view_selection_failed';
var preflight=read();if(JSON.stringify(preflight)!==JSON.stringify(out.before))throw 'target_changed_before_move';
out.noOp=out.before.x===c.x&&out.before.y===c.y;
if(!out.noOp){out.mutationAttempted=true;
if(c.kind==='device')device.moveToLocation(c.x,c.y);
else w.moveCanvasItemBy(c.note_id,c.x-out.before.x,c.y-out.before.y);}
out.after=read();out.countsAfter={devices:n.getDeviceCount(),links:n.getLinkCount()};
out.verified=out.after.x===c.x&&out.after.y===c.y&&out.after.clusterId===out.before.clusterId&&
out.countsAfter.devices===out.countsBefore.devices&&out.countsAfter.links===out.countsBefore.links&&
(c.kind==='device'?(out.after.name===out.before.name&&out.after.model===out.before.model):out.after.text===out.before.text);
out.ok=out.verified;if(!out.verified)out.error='readback_mismatch';
}catch(e){out.ok=false;out.error=String(e);}
finally{out.viewRestored=!changed;if(changed&&w&&previous){try{
w.showClusterContents(String(previous.getId()));
if(String(w.getCurrentCluster().getId())!==String(previous.getId()))throw 'restore_mismatch';
out.viewRestored=true;}catch(e){out.ok=false;out.viewRestoreError=String(e);}}}
reportResult(JSON.stringify(out));})();'''.replace('CONFIG', json.dumps(config, ensure_ascii=True), 1)


def move_result(raw, name, arguments):
    if raw is None:
        raise ValueError('Cisco no respondió. Puede haberse aplicado el movimiento; consultar pt_review_layout antes de repetir.')
    if len(raw.encode()) > 50_000:
        raise ValueError('La respuesta excede el límite. Revisar la posición real antes de repetir.')
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError('Respuesta de posición inválida. Revisar pt_review_layout antes de repetir.')
    if data.get('ok') and data.get('verified'):
        # Independently check evidence, not just Cisco's reported success flag.
        before, after, cluster = data['before'], data['after'], data['cluster']
        target = {'kind': 'device', 'device_name': arguments['device_name']} if name == 'pt_move_device' else {
            'kind': 'note', 'note_id': arguments['note_id']}
        valid = (data['target'] == target and cluster['name'] == arguments['cluster'] and
                 before['clusterId'] == after['clusterId'] == cluster['id'] and
                 before['x'] == arguments['expected_position']['x'] and
                 before['y'] == arguments['expected_position']['y'] and
                 after['x'] == arguments['x'] and after['y'] == arguments['y'] and
                 data['countsBefore'] == data['countsAfter'] and data.get('viewRestored') is True)
        if name == 'pt_move_device':
            valid = valid and before['name'] == after['name'] == arguments['device_name'] and before['model'] == after['model']
        else:
            valid = valid and before['text'] == after['text'] == arguments['expected_text']
        if not valid:
            data.update(ok=False, verified=False, error='inconsistent_readback')
    data['operation'] = name
    data['followUp'] = 'Revisar pt_review_layout y su imagen antes de confirmar legibilidad. Guardar una copia con pt_save_activity o pt_save_project cuando corresponda.'
    error = not (data.get('ok') is True and data.get('verified') is True and data.get('viewRestored') is True)
    return CallToolResult(content=[TextContent(type='text', text=json.dumps(data, ensure_ascii=False))],
                          structuredContent=data, isError=error)


async def move_layout(bridge, name, arguments):
    try:
        raw = await asyncio.to_thread(bridge.send_and_wait, move_script(name, arguments), timeout=30.0)
        return move_result(raw, name, arguments)
    except (ValueError, TypeError, KeyError) as exc:
        data = {'ok': False, 'verified': False, 'mayHaveChanged': True, 'error': str(exc),
                'followUp': 'Consultar pt_review_layout antes de repetir; no se confirma el movimiento.'}
        return CallToolResult(content=[TextContent(type='text', text=json.dumps(data, ensure_ascii=False))],
                              structuredContent=data, isError=True)
