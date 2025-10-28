import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, REST, Routes, Events } from 'discord.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ensureGuild } from './utils/storage.js';
import { logToGuild, logToOwner } from './utils/logger.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.commands = new Collection();

async function loadCommands() {
  const cmdsDir = path.resolve('commands');
  const files = await fs.readdir(cmdsDir);
  const commands = [];
  for (const f of files) {
    if (!f.endsWith('.js')) continue;
    const mod = await import(path.join(cmdsDir, f));
    if (!mod.data || !mod.execute) continue;
    client.commands.set(mod.data.name, mod);
    commands.push(mod.data.toJSON());
  }
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
}

client.once(Events.ClientReady, async c => {
  await loadCommands();
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
  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await ensureGuild(interaction.guildId);
    await cmd.execute(interaction);
    await logToGuild(client, interaction.guildId, `[명령어] ${interaction.user.tag} → /${interaction.commandName}`);
    await logToOwner(client, `[${interaction.guild?.name || 'DM'}] ${interaction.user.tag} → /${interaction.commandName}`);
  } catch (e) {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: '오류 발생' }).catch(() => {});
    } else {
      await interaction.reply({ content: '오류 발생', ephemeral: true }).catch(() => {});
    }
    await logToOwner(client, `오류: /${interaction.commandName} ${String(e)}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
