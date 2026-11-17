import http from 'node:http';
import path from 'node:path';
import {readFile,stat} from 'node:fs/promises';
import {root} from './catalog.mjs';
const dir=path.join(root,'dist'),port=Number(process.env.PORT||4188);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.pdf':'application/pdf'};
const server=http.createServer(async(req,res)=>{try{const requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(requested.includes('\\')||requested.includes('\0'))throw new Error();let file=path.resolve(dir,'.'+requested);if(file!==dir&&!file.startsWith(dir+path.sep))throw new Error();if((await stat(file)).isDirectory())file=path.join(file,'index.html');const content=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(content);}catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('ファイルが見つかりません。ライブラリのホームから開き直してください。');}});
server.on('error',err=>{if(err.code==='EADDRINUSE')console.error('すでに起動している可能性があります。http://127.0.0.1:'+port+'/ を開いてください。');else console.error(err.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`教材ライブラリ http://127.0.0.1:${port}/`));
