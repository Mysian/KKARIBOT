// deploy-commands.js
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

function pathToFileURL(p) {
  const url = new URL('file://');
  const rp = path.resolve(p).replace(/\\/g, '/');
  url.pathname = rp.startsWith('/') ? rp : `/${rp}`;
  return url;
}

async function walk(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.isFile() && e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function parseArgs(argv) {
  const args = { guild: null, clear: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--guild' && argv[i + 1]) { args.guild = argv[++i]; continue; }
    if (a.startsWith('--guild=')) { args.guild = a.split('=')[1]; continue; }
    if (a === '--clear') { args.clear = true; continue; }
  }
  return args;
}

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const appId = process.env.CLIENT_ID;
  if (!token || !appId) {
    console.error('환경변수 DISCORD_TOKEN, CLIENT_ID가 필요합니다.');
    process.exit(1);
  }

  const args = parseArgs(process.argv);
  const rest = new REST({ version: '10' }).setToken(token);

  let commands = [];
  if (!args.clear) {
    const cmdsDir = path.resolve('commands');
    const files = await walk(cmdsDir);
    for (const f of files) {
      const mod = await import(pathToFileURL(f).href).catch(async () => await import(f));
      if (mod?.data?.name && typeof mod.data.toJSON === 'function') {
        commands.push(mod.data.toJSON());
      }
    }
  }

  if (args.guild) {
    await rest.put(Routes.applicationGuildCommands(appId, args.guild), { body: commands });
    console.log(`[OK] 길드(${args.guild}) 명령어 배포 완료: ${commands.length}개`);
  } else {
    await rest.put(Routes.applicationCommands(appId), { body: commands });
    console.log(`[OK] 전역 명령어 배포 완료: ${commands.length}개`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
