# 兰香测评 · Docker 部署说明

这份包用于在另一台电脑或服务器上部署网站。前端、API 和 PostgreSQL 数据库均在本机 Docker 中运行，不依赖 GitHub Pages、Supabase 或原来的 chatgpt.site 域名，不需要注册这两个服务的账号。

包内不含现有网站的真实管理员密码、测试密码或客户结果；首次部署是新的空数据库。当前保留非收费演示提示。

## 0. 两种部署方式

| 方式 | 适用场景 | 需要什么 |
| --- | --- | --- |
| Docker 本包（第 1—10 节） | 离线、局域网或自有服务器；数据全在自己机器上 | 一台能装 Docker 的电脑 |
| GitHub Pages + Supabase（第 12 节） | 想让别人点开链接就能用，不用自己开服务器 | GitHub 账号 + Supabase 账号（都有免费额度） |

两种方式共用同一套前端源码和 API 逻辑：Docker 版由 Node 进程提供接口，云端版由 Supabase Edge Function 提供接口，题库算法有测试保证两边结果一致。可以只选一种，也可以两种都留着。

## 1. 明天需要准备什么

- 下载并解压 `兰香测评-Docker部署包.zip`，进入解压后的 `lanxiang-docker` 文件夹。
- Windows / macOS：安装并启动 [Docker Desktop](https://docs.docker.com/get-started/get-docker/)。Windows 使用 Linux containers；Docker Desktop 提示需要 WSL 2 时按提示安装。
- Linux 服务器：安装 [Docker Engine](https://docs.docker.com/engine/install/) 和 [Compose 插件](https://docs.docker.com/compose/install/linux/)，并确保当前用户能运行 Docker。
- 第一次部署需要联网下载 Node、PostgreSQL 镜像及 npm 依赖；本包是源码部署包，不是离线镜像包。不需要在目标电脑另外安装 Node.js 或数据库。

打开终端，先检查：

```text
docker version
docker compose version
```

`docker version` 必须同时有 Client 和 Server。只有 Client、提示无法连接 daemon 时，先启动 Docker Desktop / Docker 服务。

## 2. 首次启动：Windows

进入 `lanxiang-docker` 文件夹，在地址栏输入 `powershell` 并回车，运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
docker compose up -d --build
docker compose ps
```

第一条命令自动生成 `.env` 配置，并显示**你的新管理员密码**。请保存它。若忘记，可在本机 `.env` 中查看 `ADMIN_SECRET=` 后面的值。

## 3. 首次启动：macOS / Linux

在终端进入 `lanxiang-docker` 文件夹，运行：

```sh
sh setup.sh
docker compose up -d --build
docker compose ps
```

首次编译和下载可能需要几分钟。`.env` 已存在时，初始化脚本会拒绝覆盖；保留原文件，直接运行 `docker compose up -d --build`。

## 4. 打开网站和生成测试密码

- 网站：<http://localhost:8080/>
- 管理页：<http://localhost:8080/admin/>
- 管理员密码：初始化时生成，保存在你自己的 `.env` 中；旧网站的管理员密码不会自动沿用。

管理入口不会在用户首页展示。登录管理页后批量生成密码，完整密码会保存在“密码使用记录”里，随时可以复制或导出。解锁时仍然只比对密码摘要，公开页面读不到任何密码；但数据库里确实存有明文密码，请务必保管好管理员密码与数据库。

每个测试密码可以**开始 3 次**。输入密码不会扣次数，点击开始才扣 1 次；放弃一次已开始的测试也会占用次数。同一浏览器可以继续未完成的测试、返回上一题。完成后可下载结果长图、复制分享链接。分享页只能查看结果，不能测试或再测。

图片保存：电脑端下载 PNG；手机浏览器可以长按图片保存或使用系统分享。某些手机浏览器会先保存到“文件/下载”，网站无法强制写入相册。

## 5. 用手机或另一台电脑访问

默认仅部署电脑本机可以访问。需要在同一个 Wi-Fi 内测试时，先查部署电脑的局域网 IP，例如 `192.168.1.20`。

用文本编辑器打开 `.env`，修改：

```dotenv
BIND_ADDRESS=0.0.0.0
PORT=8080
PUBLIC_ORIGINS=http://192.168.1.20:8080,http://localhost:8080,http://127.0.0.1:8080
```

保存后运行：

```sh
docker compose up -d
```

手机打开 `http://192.168.1.20:8080/`。如果不通，检查电脑防火墙是否允许 TCP 8080、设备是否在同一网络。`localhost` 和 `127.0.0.1` 指打开网页的那台设备，不能把这样的分享链接发给别人的手机。

`PUBLIC_ORIGINS` 是浏览器实际访问的网址前缀，多项用英文逗号分隔，不要带末尾 `/` 或 `/admin/` 路径。如果改端口，也必须同步改这里的端口。分享链接按当前访问地址生成。

局域网 IP 变化后要更新配置。HTTP 局域网访问下，复制功能可能改为弹窗手动复制；正式对外使用建议按下一节配置 HTTPS。

## 6. 让别人通过公网域名访问（可选）

需要一台持续开机、能接收入站连接的服务器，以及你控制的域名。仅在另一台普通电脑启动 Docker，不会自动获得公网网址。

本包附带可选 Caddy HTTPS 配置。将域名的 A 记录指向服务器公网 IP（若有 AAAA 记录，也要指向正确的 IPv6 地址），开放服务器/云安全组的 TCP 80 和 443。

在 `.env` 中设置，例如：

```dotenv
SITE_DOMAIN=test.example.com
PUBLIC_ORIGINS=https://test.example.com
TRUST_PROXY=1
BIND_ADDRESS=127.0.0.1
```

然后运行：

```sh
docker compose -f compose.yaml -f compose.https.yaml up -d --build
docker compose -f compose.yaml -f compose.https.yaml ps
```

打开 `https://test.example.com/`；管理员地址是 `https://test.example.com/admin/`。Caddy 在域名解析正确、端口可达的情况下申请和续期证书，条件见 [Caddy 官方 HTTPS 说明](https://caddyserver.com/docs/quick-starts/https)。之后启动/停止该 HTTPS 部署时，都使用这两份 `-f` 配置：

```sh
docker compose -f compose.yaml -f compose.https.yaml logs --tail=100 caddy
docker compose -f compose.yaml -f compose.https.yaml down
docker compose -f compose.yaml -f compose.https.yaml up -d
```

默认数据库没有对外发布 5432 端口。`TRUST_PROXY=1` 只用于附带的 Caddy 或你控制的反向代理；直接暴露 8080 的局域网模式保持 `0`。

## 7. 日常操作

在项目文件夹里运行：

```sh
# 查看状态
docker compose ps
# 查看最近日志
docker compose logs --tail=100 app db
# 重启网站
docker compose restart app
# 停止（保留数据库）
docker compose down
# 再启动
docker compose up -d
# 源码更新后重新编译并启动
docker compose up -d --build
```

数据库保存在名为 `lanxiang_db_data` 的 Docker volume 中。重启容器、重新编译网站或普通 `down` 不会清空数据。**不要使用 `docker compose down -v` 或删除这个 volume**，否则密码额度和结果会丢失。复制源码文件夹不等于备份数据库。

## 8. 备份和搬家

Windows：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup.ps1
```

macOS / Linux：

```sh
sh scripts/backup.sh
```

会生成 `backups/日期-时间/`，里面有：

- `lanxiang.dump`：密码库存、额度、结果及数据库结构。
- `config.env`：管理员密码、签名密钥和数据库密码。

两个文件都要妥善保存，不要放进公开仓库或发给测试用户。备份脚本只导出数据，不修改当前网站。数据库必须正在运行。

### 恢复到另一台电脑

恢复会覆盖目标数据库，先备份目标已有数据。以下适用于本包相同版本、相同数据库用户和 PostgreSQL 17：

1. 解压源码包，把备份中的 `config.env` 复制到项目根目录并重命名为 `.env`。不要再运行初始化脚本；如机器 IP/域名不同，修改 `PUBLIC_ORIGINS`。
2. 把备份中的 `lanxiang.dump` 也放在项目根目录。
3. 运行以下命令：

```sh
docker compose up -d db
```

等 `docker compose ps` 显示数据库 healthy 后，运行：

```sh
docker compose stop app
docker compose cp lanxiang.dump db:/tmp/restore.dump
docker compose exec -T db pg_restore -U lanxiang_owner -d lanxiang --clean --if-exists --no-owner --exit-on-error /tmp/restore.dump
docker compose up -d --build
```

恢复后原来的测试密码和已用次数会保留。结果 ID 也会保留，但更换域名后需要用新域名复制分享链接；旧域名能否继续访问取决于你是否保留它。

数据库初始化脚本只在空 volume 首次启动时执行。[PostgreSQL 官方镜像说明](https://hub.docker.com/_/postgres)也明确了这一行为。已有数据时，修改 `.env` 的 `DB_PASSWORD` / `APP_DB_PASSWORD` 不会同步修改数据库中的密码，会导致连接失败；不要随意改这两个值。

## 9. 管理员密码修改

修改 `.env` 的 `ADMIN_SECRET`，使用不少于 24 个字符的新密码，然后运行：

```sh
docker compose up -d app
```

如需同时令旧管理员登录状态失效，修改 `SESSION_SIGNING_KEY` 为至少 32 个字符的随机值；这样普通用户的密码验证登录状态也会失效，但数据库中的次数和结果保留。

## 10. 常见问题

| 现象 | 处理方法 |
| --- | --- |
| Cannot connect to Docker daemon | 启动 Docker Desktop / Docker 服务，检查 `docker version` 的 Server 部分。 |
| 镜像/依赖下载失败 | 检查目标电脑是否能访问 Docker Hub 和 npm；检查 Docker Desktop 的网络/代理设置后重试。 |
| 8080 已占用 | 修改 `PORT=8081`，同时更新 `PUBLIC_ORIGINS`，再运行 `docker compose up -d`。 |
| 页面打开但提示地址未授权 | `.env` 的 `PUBLIC_ORIGINS` 要包含实际使用的网址协议、主机和端口，不能带末尾斜杠。 |
| 网站容器反复重启 | 看 `docker compose logs --tail=100 app db`。确认已生成 `.env`，并未改已有数据库的密码。 |
| 管理密码忘记 | 在 `.env` 中查看 `ADMIN_SECRET`，不是测试用的 `LX-...` 密码。 |
| 结果分享给别人打不开 | 不能使用 localhost 分享。使用局域网 IP 或已配置好的公网 HTTPS 域名；部署电脑必须持续开机。 |
| HTTPS 证书申请失败 | 检查 DNS、80/443、防火墙、安全组和已有服务的端口冲突，查看 Caddy 日志。 |

## 11. 包内结构与验证范围

- `Dockerfile`：编译 React 前端，运行 Node 24 API；网站进程以普通用户运行。
- `compose.yaml`：网站 + PostgreSQL 17，数据库持久卷，健康检查。
- `compose.https.yaml` / `Caddyfile`：可选公网 HTTPS。
- `db/`：数据库初始化；API 使用单独的数据库角色。
- `src/` / `server/`：前端与后端源码。
- `setup.sh` / `setup.ps1`：首次随机生成配置。
- `scripts/backup.*`：备份脚本。
- `supabase/`：云端版数据库迁移与 Edge Function；`scripts/build-edgefn.mjs`、`scripts/build-quiz-data.mjs`（`npm run sync`）负责让两边实现与题库保持同源。
- `.github/workflows/deploy-pages.yml`：GitHub Pages 自动构建发布。
- `tests/`：结果算法、数据库额度/权限、API、HTTP、Supabase 迁移与 Edge Function 题库一致性测试。

交付前已通过前后端 TypeScript 检查、Vite 编译、10 人物匹配覆盖、3 次额度/重复请求、结果不可覆盖、分享读取、管理员权限、限流、HTTP 路由和配置生成检查；云端版另外覆盖 Supabase 迁移的 RLS/权限收口，以及 Edge Function 匹配算法与 Docker 版的逐题一致性。SQL/API 测试使用 PGlite PostgreSQL 引擎，且按网站数据库角色测试。

当前电脑的 Docker 引擎未运行，因此**没有完成真实 Docker 镜像构建、容器启动、多连接 PostgreSQL 并发和备份恢复的实机验证**。明天按步骤启动后，再用管理页生成一条测试密码，实际验证三次额度、长图下载和手机分享。

Docker 配置与数据持久化参考：[Compose 官方安装说明](https://docs.docker.com/compose/install/)、[Docker Compose 启动说明](https://docs.docker.com/reference/cli/docker/compose/up/)、[Docker volume 说明](https://docs.docker.com/engine/storage/volumes/)。

## 12. 部署到 GitHub Pages + Supabase（云端版）

### 12.1 这套结构长什么样

- 前端：静态文件托管在 GitHub Pages，网址形如 `https://<用户名>.github.io/<仓库名>/`。
- 接口：Supabase Edge Function `assessment-api`，承担原来 Node 服务的全部职责（解锁密码、额度、提交结果、分享读取、管理页）。
- 数据库：Supabase Postgres，表结构与 `db/01-schema.sql` 一致，只是把原来的 `lx_app` 角色换成了 `service_role`。
- 浏览器端只拿得到 Supabase 的 publishable key，而四张表都开启了 RLS 且没有任何策略，也没有给 `anon` / `authenticated` 任何表权限或函数执行权限，因此网页端读不到密码、会话和限流记录；额度判断、密码校验、结果写入全在数据库函数里完成。
- Edge Function 与 Docker 版共用同一份处理器：`npm run sync` 会把 `server/handler.ts` 复制到 `supabase/functions/assessment-api/`，`tests/edge-data.mjs` 再用 3000 组随机作答验证两边结果完全一致。

### 12.2 前端如何找到接口

`src/api.ts` 会读取构建时变量 `VITE_API_BASE`：

- 设了值（例如 `https://<ref>.supabase.co/functions/v1/assessment-api/`）→ 请求发到 Supabase。
- 没设值 → 仍然请求同源的 `/api/assessment-api/`，Docker 版行为不变。

`.github/workflows/deploy-pages.yml` 里已经写好了这个地址（也可以用仓库变量 `VITE_API_BASE` 覆盖）。改动仓库变量后重新跑一次工作流即可。

### 12.3 第一次在云端搭建的步骤

1. 建 Supabase 项目，记下 Project ref。
2. 在 SQL Editor 里执行 `supabase/migrations/` 下的迁移，建表、函数、权限。
3. 写入运行配置（管理员密码、签名密钥、允许的来源、题库地址）：

```sql
create extension if not exists pgcrypto;
insert into public.lx_config(key,value) values
  ('ADMIN_SECRET','LXADMIN-'||encode(gen_random_bytes(24),'hex')),
  ('SESSION_SIGNING_KEY',encode(gen_random_bytes(32),'hex')),
  ('CLIENT_ORIGINS','https://<用户名>.github.io'),
  ('QUIZ_DATA_URL','https://<用户名>.github.io/<仓库名>/quiz-data.json')
on conflict(key) do nothing;
```

管理员密码就是 `ADMIN_SECRET` 的值，随时可以用 `select value from public.lx_config where key='ADMIN_SECRET';` 查看。

4. `npm run sync` 生成 `public/quiz-data.json`，提交后由 Pages 提供；Edge Function 首次冷启动时会把它读进数据库缓存，以后即使外网取不到也能继续算结果。
5. 部署 Edge Function：安装 Supabase CLI 后运行 `npx supabase functions deploy assessment-api --project-ref <ref> --no-verify-jwt`，或者用支持 Edge Function 的 MCP/控制台把 `supabase/functions/assessment-api/` 三个文件传上去，记得关闭 JWT 校验（函数自己校验密码与令牌）。
6. 推送仓库到 GitHub（默认分支 `main`），`.github/workflows/deploy-pages.yml` 会自动跑测试、构建前端并发布 Pages。仓库 Settings → Pages 的 Source 选 “GitHub Actions”。
7. 部署后想确认整条链路是否正常，可以运行：

```sh
ORIGIN=https://<用户名>.github.io \
API_BASE=https://<ref>.supabase.co/functions/v1/assessment-api/ \
ADMIN_SECRET=<管理员密码> node scripts/check-deployed.mjs
```

它会检查来源限制、管理员登录、生成密码、解锁、3 次额度、并发开始、提交结果（并与本地算法逐字段比对）、分享读取、停用启用和限流。

### 12.4 之后的日常维护

- 改题目或人物：改 `src/lib/assessment.ts`，运行 `npm run sync` 后提交，Pages 工作流会自动构建。
- 改管理密码：`update public.lx_config set value='LXADMIN-...' where key='ADMIN_SECRET';`，最长 60 秒后生效（函数会缓存配置）。
- 换域名：同步更新 `CLIENT_ORIGINS`（多个来源用英文逗号分隔），否则浏览器会收到“访问地址未授权”。
- 免费版 Supabase 项目连续 7 天没有请求会被暂停，重新启用即可，数据不会丢。

### 12.5 与 Docker 版的差别

- 分享链接由 Pages 域名生成，例如 `https://<用户名>.github.io/<仓库名>/?r=<结果ID>`。
- 结果计算发生在 Edge Function 里（题库来自 `public/quiz-data.json`），Docker 版则直接用 `server/assessment.ts` 里的题库。
- 限流按请求来源 IP 统计，来源头由 Edge 运行时提供；Docker 版在反代后面需要显式设置 `TRUST_PROXY=1`。
