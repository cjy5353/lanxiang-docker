import {randomBytes} from 'node:crypto';
import {writeFileSync,existsSync} from 'node:fs';
const file='.env';
if(existsSync(file)){console.error('.env 已存在，保留原配置。请直接启动，或手动编辑此文件。');process.exit(1);}
const secret=()=>randomBytes(32).toString('hex');
const admin='LXADMIN-'+secret();
writeFileSync(file,`# 管理员密码；不要分享这个文件\nADMIN_SECRET=${admin}\nSESSION_SIGNING_KEY=${secret()}\nDB_PASSWORD=${secret()}\nAPP_DB_PASSWORD=${secret()}\nPORT=8080\nBIND_ADDRESS=127.0.0.1\nPUBLIC_ORIGINS=http://localhost:8080,http://127.0.0.1:8080\nTRUST_PROXY=0\n`,{mode:0o600,flag:'wx'});
console.log('配置已生成。网站：http://localhost:8080/');
console.log('管理页：http://localhost:8080/admin/');
console.log('管理员密码：'+admin);
console.log('请保存管理员密码；密码也在本机 .env 文件中。');
