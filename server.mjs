import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const port=Number(process.env.PORT || 8896);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.svg':'image/svg+xml','.pdf':'application/pdf','.md':'text/plain; charset=utf-8','.task':'application/octet-stream','.zip':'application/zip','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime'};
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const route=decodeURIComponent(url.pathname).replace(/^\/demo(?=\/|$)/,'')||'/';
    const target=path.resolve(root,'.'+route);
    if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    let file=target;
    if((await stat(file)).isDirectory())file=path.join(file,'index.html');
    const body=await readFile(file);
    const mime=types[path.extname(file)]||'application/octet-stream';
    const headers={'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"connect-src 'self'"};
    if(mime.startsWith('video/')){
      headers['Accept-Ranges']='bytes';
      const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range||'');
      if(m){
        const start=m[1]?Number(m[1]):0;
        const end=m[2]?Math.min(body.length-1,Number(m[2])):body.length-1;
        if(start>=body.length||end<start){res.writeHead(416,{...headers,'Content-Range':'bytes */'+body.length});res.end();return;}
        const slice=body.subarray(start,end+1);
        res.writeHead(206,{...headers,'Content-Range':'bytes '+start+'-'+end+'/'+body.length,'Content-Length':slice.length});res.end(slice);return;
      }
    }
    res.writeHead(200,{...headers,'Content-Length':body.length});res.end(body);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('文件不存在');}
}).listen(port,'127.0.0.1',()=>console.log(`Rain to Radiance: http://127.0.0.1:${port}/demo/`));