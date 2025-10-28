import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getSettings, setSettings } from '../utils/storage.js';

export const data = new SlashCommandBuilder()
  .setName('setlog')
  .setDescription('로그 채널 설정')
  .addChannelOption(o => o.setName('channel').setDescription('로그 채널').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: '서버에서만 사용 가능', ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  const ch = interaction.options.getChannel('channel', true);
  const cur = await getSettings(interaction.guildId);
  const next = { ...cur, logChannelId: ch.id };
  await setSettings(interaction.guildId, next);
  await interaction.editReply(`로그 채널 설정됨: <#${ch.id}>`);
}
