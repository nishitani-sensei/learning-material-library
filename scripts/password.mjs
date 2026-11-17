import {randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {root} from './catalog.mjs';
import path from 'node:path';
let password;
if(process.argv.includes('--initial'))password=`mori-${randomBytes(5).toString('hex')}`;
else {const rl=createInterface({input:process.stdin,output:process.stdout});password=(await rl.question('新しい先生用パスワード（8文字以上）を入力してください：')).trim();rl.close();}
if(!password||password.length<8)throw new Error('パスワードは8文字以上にしてください');
const salt=randomBytes(16).toString('hex');const digest=createHash('sha256').update(salt+':'+password).digest('hex');
await mkdir(path.join(root,'config'),{recursive:true});await mkdir(path.join(root,'.local'),{recursive:true});
await writeFile(path.join(root,'config','teacher-mode.json'),JSON.stringify({algorithm:'SHA-256',salt,digest},null,2)+'\n');
await writeFile(path.join(root,'.local','先生モードのパスワード.txt'),`教材ライブラリ 先生モード\n\nパスワード：${password}\n\nこのメモはPC内だけに保管します。GitHubには掲載しません。\n表示切り替え用です。教材ファイル自体の閲覧を制限するものではありません。\n変更後はサイトを再生成し、GitHubへ反映してください。\n`);
console.log('設定しました。パスワードは .local/先生モードのパスワード.txt に保存しました。');
