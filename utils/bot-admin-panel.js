// utils/bot-admin-panel.js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField, Events } from 'discord.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureGuild, readGuildJSON, writeGuildJSON } from './storage.js';

const sh = promisify(exec);
const TARGET_GUILD_ID = '1432591543943827539';
const TARGET_CHANNEL_ID = '1432592402786291732';
const STORE_FILE = 'admin_panel.json';

function rows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('botctl:gitpull').setLabel('봇 업데이트').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('botctl:deploy').setLabel('명령어 업데이트').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('botctl:restart').setLabel('봇 재시작').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('botctl:refresh').setLabel('새로고침').setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildEmbed(state) {
  const e = new EmbedBuilder()
    .setTitle('봇 관리 패널')
    .setDescription('서버 관리 전용 패널입니다.')
    .setColor(state?.lastStatus === 'success' ? 0x22c55e : state?.lastStatus === 'error' ? 0xef4444 : 0x3b82f6)
    .addFields(
      { name: '대상 서버', value: TARGET_GUILD_ID, inline: true },
      { name: '대상 채널', value: TARGET_CHANNEL_ID, inline: true },
      { name: '마지막 작업', value: state?.lastAction || '-', inline: true },
      { name: '결과', value: state?.lastStatus || '-', inline: true },
      { name: '업데이트 시간', value: state?.updatedAt || '-', inline: true }
    );
  return e;
}

async function ensurePanelMessage(client) {
  await ensureGuild(TARGET_GUILD_ID);
  const state = await readGuildJSON(TARGET_GUILD_ID, STORE_FILE, {});
  const guild = await client.guilds.fetch(TARGET_GUILD_ID).catch(() => null);
  if (!guild) return null;
  const channel = await guild.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return null;
  if (state.messageId) {
    const msg = await channel.messages.fetch(state.messageId).catch(() => null);
    if (msg) return msg;
  }
  const sent = await channel.send({ embeds: [buildEmbed(state)], components: rows() });
  await writeGuildJSON(TARGET_GUILD_ID, STORE_FILE, { ...state, messageId: sent.id, channelId: TARGET_CHANNEL_ID });
  return sent;
}

async function updatePanelMessage(client, partial) {
  await ensureGuild(TARGET_GUILD_ID);
  const prev = await readGuildJSON(TARGET_GUILD_ID, STORE_FILE, {});
  const next = { ...prev, ...partial };
  await writeGuildJSON(TARGET_GUILD_ID, STORE_FILE, next);
  const msg = await ensurePanelMessage(client);
  if (msg) await msg.edit({ embeds: [buildEmbed(next)], components: rows() });
}

async function runTask(cmd) {
  const { stdout, stderr } = await sh(cmd, { cwd: process.cwd(), windowsHide: true, timeout: 1000 * 60 * 5, maxBuffer: 1024 * 1024 * 5 });
  return { stdout, stderr };
}

function ensureAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
}

export default function registerBotAdminPanel(client) {
  client.once(Events.ClientReady, async () => {
    await ensurePanelMessage(client);
  });

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    if (!interaction.inGuild()) return;
    if (interaction.guildId !== TARGET_GUILD_ID) return;
    if (interaction.channelId !== TARGET_CHANNEL_ID) return;
    const id = interaction.customId;
    if (!id.startsWith('botctl:')) return;

    if (!ensureAdmin(interaction)) {
      await interaction.reply({ content: '관리자만 사용할 수 있습니다.', ephemeral: true }).catch(() => {});
      return;
    }

    try {
      await interaction.deferReply({ ephemeral: true });
      let action = '';
      let command = '';

      if (id === 'botctl:gitpull') {
        action = '봇 업데이트 (git pull origin main)';
        command = 'git pull origin main';
      } else if (id === 'botctl:deploy') {
        action = '봇 명령어 업데이트 (node deploy-commands.js)';
        command = 'node deploy-commands.js';
      } else if (id === 'botctl:restart') {
        action = '봇 재시작 (pm2 restart index.js)';
        command = 'pm2 restart kkaribot';
      } else if (id === 'botctl:refresh') {
        await updatePanelMessage(client, { updatedAt: new Date().toISOString() });
        await interaction.editReply({ content: '패널을 새로고침했습니다.' });
        return;
      } else {
        await interaction.editReply({ content: '알 수 없는 작업입니다.' });
        return;
      }

      await updatePanelMessage(client, { lastAction: action, lastStatus: '진행 중', updatedAt: new Date().toISOString() });

      const { stdout, stderr } = await runTask(command).catch(async err => {
        await updatePanelMessage(client, { lastStatus: 'error', updatedAt: new Date().toISOString() });
        const msg = (err?.stderr || err?.stdout || String(err) || '').slice(0, 1800);
        await interaction.editReply({ content: `실패\n${'```'}\n${msg}\n${'```'}` });
        throw err;
      });

      await updatePanelMessage(client, { lastStatus: 'success', updatedAt: new Date().toISOString() });

      const out = (stdout || '').trim();
      const err = (stderr || '').trim();
      const body =
        (out ? `STDOUT:\n${out}\n` : '') +
        (err ? `\nSTDERR:\n${err}\n` : '');
      await interaction.editReply({ content: `완료: ${action}\n${'```'}\n${body.slice(0, 1800) || '(출력 없음)'}\n${'```'}` });
    } catch {}
  });
}
