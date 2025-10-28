import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Ping');

export async function execute(interaction) {
  const t0 = Date.now();
  await interaction.deferReply({ ephemeral: true });
  const ms = Date.now() - t0;
  await interaction.editReply(`Pong! ${ms}ms`);
}
