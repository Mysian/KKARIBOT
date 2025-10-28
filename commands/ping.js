import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Ping');

export async function execute(interaction) {
  const now = Date.now();
  await interaction.reply({ content: 'Pong!', ephemeral: true });
  const diff = Date.now() - now;
  await interaction.editReply({ content: `Pong! ${diff}ms` });
}
