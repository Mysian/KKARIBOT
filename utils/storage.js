// storage.js
import { promises as fs } from 'node:fs';
import path from 'node:path';

const base = path.resolve('data');

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function readJSON(p, fallback) {
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJSON(p, obj) {
  const dir = path.dirname(p);
  await ensureDir(dir);
  await fs.writeFile(p, JSON.stringify(obj, null, 2), 'utf8');
}

export async function ensureGuild(guildId) {
  const guildDir = path.join(base, guildId);
  await ensureDir(guildDir);
  const usersPath = path.join(guildDir, 'users.json');
  const settingsPath = path.join(guildDir, 'settings.json');
  const users = await readJSON(usersPath, {});
  const settings = await readJSON(settingsPath, { logChannelId: null });
  await writeJSON(usersPath, users);
  await writeJSON(settingsPath, settings);
  return { guildDir, usersPath, settingsPath, users, settings };
}

export function guildPath(guildId, ...segments) {
  return path.join(base, guildId, ...segments);
}

export async function readGuildJSON(guildId, filename, fallback = {}) {
  const { guildDir } = await ensureGuild(guildId);
  const p = path.join(guildDir, filename);
  return readJSON(p, fallback);
}

export async function writeGuildJSON(guildId, filename, data) {
  const { guildDir } = await ensureGuild(guildId);
  const p = path.join(guildDir, filename);
  await writeJSON(p, data);
  return data;
}

export async function updateGuildJSON(guildId, filename, updater, fallback = {}) {
  const curr = await readGuildJSON(guildId, filename, fallback);
  const next = await updater(curr);
  await writeGuildJSON(guildId, filename, next);
  return next;
}

export async function getSettings(guildId) {
  return readGuildJSON(guildId, 'settings.json', { logChannelId: null });
}

export async function setSettings(guildId, settings) {
  return writeGuildJSON(guildId, 'settings.json', settings);
}

export async function getUserBalance(guildId, userId) {
  const users = await readGuildJSON(guildId, 'users.json', {});
  return Number(users[userId]?.balance || 0);
}

export async function setUserBalance(guildId, userId, amount) {
  const users = await readGuildJSON(guildId, 'users.json', {});
  users[userId] = users[userId] || {};
  users[userId].balance = Number(amount);
  await writeGuildJSON(guildId, 'users.json', users);
  return users[userId].balance;
}

export async function addUserBalance(guildId, userId, delta) {
  const current = await getUserBalance(guildId, userId);
  const next = current + Number(delta);
  return setUserBalance(guildId, userId, next);
}
