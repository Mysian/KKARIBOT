import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Partials, REST, Routes, Events } from 'discord.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ensureGuild } from './utils/storage.js';
import { logToGuild, logToOwner } from './utils/logger.js';
import registerBotAdminPanel from './utils/bot-admin-panel.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.GuildMember]
});

registerBotAdminPanel(client);

client.commands = new Collection();
const buttonRouter = [];
const selectRouter = [];
const modalRouter = [];

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

function registerComponentMap(routerArr, obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const [prefix, handler] of Object.entries(obj)) {
    if (typeof handler !== 'function' || !prefix || typeof prefix !== 'string') continue;
    routerArr.push([prefix, handler]);
  }
  routerArr.sort((a, b) => b[0].length - a[0].length);
}

async function loadCommands() {
  const cmdsDir = path.resolve('commands');
  const files = await walk(cmdsDir);
  const commands = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(f).href).catch(async () => await import(f));
    if (mod?.data?.name) {
      client.commands.set(mod.data.name, mod);
      if (typeof mod.data.toJSON === 'function') commands.push(mod.data.toJSON());
    }
    registerComponentMap(buttonRouter, mod?.buttons);
    registerComponentMap(selectRouter, mod?.selects);
    registerComponentMap(modalRouter, mod?.modals);
  }
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
}

function pathToFileURL(p) {
  const url = new URL('file://');
  const rp = path.resolve(p).replace(/\\/g, '/');
  url.pathname = rp.startsWith('/') ? rp : `/${rp}`;
  return url;
}

async function safeReply(interaction, payload, ephemeral = true) {
  try {
    if (interaction.deferred || interaction.replied) return await interaction.editReply(payload);
    return await interaction.reply({ ephemeral, ...payload });
  } catch {}
}

client.once(Events.ClientReady, async c => {
  await loadCommands();
  for (const [id] of c.guilds.cache) await ensureGuild(id);
  await logToOwner(client, `로그인 완료: ${c.user.tag}`);
});

client.on(Events.GuildCreate, async g => {
  await ensureGuild(g.id);
  await logToOwner(client, `봇이 초대됨: ${g.name} (${g.id})`);
});

client.on(Events.GuildDelete, async g => {
  await logToOwner(client, `봇이 제거됨: ${g.id}`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isAutocomplete()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd?.autocomplete) await cmd.autocomplete(interaction);
      return;
    }

    if (interaction.isChatInputCommand()) {
      if (!interaction.inGuild()) return;
      await ensureGuild(interaction.guildId);
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd?.execute) return;
      await cmd.execute(interaction);
      await logToGuild(client, interaction.guildId, `[명령어] ${interaction.user.tag} → /${interaction.commandName}`);
      await logToOwner(client, `[${interaction.guild?.name || 'DM'}] ${interaction.user.tag} → /${interaction.commandName}`);
      return;
    }

    if (interaction.isUserContextMenuCommand()) {
      if (!interaction.inGuild()) return;
      await ensureGuild(interaction.guildId);
      const cmd = client.commands.get(interaction.commandName);
      if (cmd?.contextUser) await cmd.contextUser(interaction);
      return;
    }

    if (interaction.isMessageContextMenuCommand()) {
      if (!interaction.inGuild()) return;
      await ensureGuild(interaction.guildId);
      const cmd = client.commands.get(interaction.commandName);
      if (cmd?.contextMessage) await cmd.contextMessage(interaction);
      return;
    }

    if (interaction.isButton()) {
      if (!interaction.inGuild()) return;
      await ensureGuild(interaction.guildId);
      const id = interaction.customId || '';
      for (const [prefix, handler] of buttonRouter) {
        if (id.startsWith(prefix)) {
          await handler(interaction);
          return;
        }
      }
      await safeReply(interaction, { content: '지원되지 않는 버튼입니다.' });
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (!interaction.inGuild()) return;
      await ensureGuild(interaction.guildId);
      const id = interaction.customId || '';
      for (const [prefix, handler] of selectRouter) {
        if (id.startsWith(prefix)) {
          await handler(interaction);
          return;
        }
      }
      await safeReply(interaction, { content: '지원되지 않는 선택 메뉴입니다.' });
      return;
    }

    if (interaction.isModalSubmit()) {
      if (!interaction.inGuild()) return;
      await ensureGuild(interaction.guildId);
      const id = interaction.customId || '';
      for (const [prefix, handler] of modalRouter) {
        if (id.startsWith(prefix)) {
          await handler(interaction);
          return;
        }
      }
      await safeReply(interaction, { content: '지원되지 않는 모달입니다.' });
      return;
    }
  } catch (e) {
    await safeReply(interaction, { content: '오류가 발생했어요.' });
    try { await logToOwner(client, `오류: ${interaction?.commandName || interaction?.customId || 'N/A'} ${String(e)}`); } catch {}
  }
});

process.on('unhandledRejection', async e => {
  try { await logToOwner(client, `unhandledRejection: ${String(e)}`); } catch {}
});
process.on('uncaughtException', async e => {
  try { await logToOwner(client, `uncaughtException: ${String(e)}`); } catch {}
});

client.login(process.env.DISCORD_TOKEN);
