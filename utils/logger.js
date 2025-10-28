import { getSettings } from './storage.js';

export async function logToGuild(client, guildId, content) {
  const settings = await getSettings(guildId);
  if (settings.logChannelId) {
    const channel = await client.channels.fetch(settings.logChannelId).catch(() => null);
    if (channel && channel.isTextBased()) await channel.send({ content });
  }
}

export async function logToOwner(client, content) {
  const guildId = process.env.OWNER_GUILD_ID;
  const channelId = process.env.OWNER_CHANNEL_ID;
  if (!guildId || !channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel && channel.isTextBased()) await channel.send({ content });
}
