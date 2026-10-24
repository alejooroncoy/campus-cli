import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isLibraryPage,isSameLibraryDocument} from '../src/lib/library-navigation.ts';
const origin='https://campuscli.com';
test('only public HTML library pages use in-place navigation',()=>{
 for(const path of ['/biblioteca/','/biblioteca/?q=SQL&tipo=proyecto','/biblioteca/cursos/3/?tipo=proyecto','/biblioteca/trabajos/proyecto-123/#feedback']) assert.equal(isLibraryPage(new URL(path,origin),origin),true,path);
 for(const path of ['/app/biblioteca/','/api/app/library/works/1/files/2','/biblioteca/sitemap.xml','/biblioteca/plantilla/','/biblioteca/cursos/0/','https://otro.example/biblioteca/']) assert.equal(isLibraryPage(new URL(path,origin),origin),false,path);
});
test('anchors keep native scrolling; query changes request new results',()=>{
 const a=new URL('/biblioteca/cursos/3/?tipo=proyecto',origin);
 assert.equal(isSameLibraryDocument(a,new URL(a+'#feedback')),true);
 assert.equal(isSameLibraryDocument(a,new URL('/biblioteca/cursos/3/?tipo=apuntes',origin)),false);
 assert.equal(isSameLibraryDocument(a,new URL('/biblioteca/cursos/2/?tipo=proyecto',origin)),false);
});

test('workspace routes join the router without intercepting other account or authentication pages',async()=>{
 const {isLibraryRoute,isLibraryWorkspace}=await import('../src/lib/library-navigation.ts');
 for(const path of ['/app/biblioteca/','/app/biblioteca/#subir','/app/biblioteca/#aportes','/app/biblioteca/#revision']) {
  assert.equal(isLibraryWorkspace(new URL(path,origin),origin),true,path);
  assert.equal(isLibraryRoute(new URL(path,origin),origin),true,path);
 }
 for(const path of ['/app/','/app/asistente/','/app/perfil/','/api/app/auth/start','/api/app/library/mine','https://otro.example/app/biblioteca/']) assert.equal(isLibraryRoute(new URL(path,origin),origin),false,path);
});
test('workspace view hashes do not consume native content or skip anchors',async()=>{
 const {isLibraryWorkspaceViewHash}=await import('../src/lib/library-navigation.ts');
 for(const hash of ['', '#aportes','#subir','#revision'])assert.equal(isLibraryWorkspaceViewHash(hash),true);
 for(const hash of ['#lib-workspace','#lib-editor-title','#contenido'])assert.equal(isLibraryWorkspaceViewHash(hash),false);
});
