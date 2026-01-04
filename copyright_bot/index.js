import { Telegraf } from 'telegraf';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

// === Database setup ===
const adapter = new JSONFile('db.json');
const db = new Low(adapter);
await db.read();
db.data ||= { logs: [] };
await db.write();

// === Bot token from environment variable ===
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN is not defined in environment variables!");

const bot = new Telegraf(BOT_TOKEN);

// === Commands ===
bot.start((ctx) => ctx.reply(`👋 Welcome! I protect your group from copyright violations.`));
bot.help((ctx) => ctx.reply('/status - check logs\n/reports - view all reports'));

// === Real Detection (keyword based) ===
const keywords = ['copyright', 'infringement', 'steal', 'unauthorized'];

bot.on('text', async (ctx) => {
  const text = ctx.message.text.toLowerCase();
  if (keywords.some(k => text.includes(k))) {
    db.data.logs.push({ user: ctx.from.username || ctx.from.first_name, message: ctx.message.text, date: new Date().toISOString() });
    await db.write();

    ctx.reply(`⚠️ ${ctx.from.first_name}, your message might violate copyright!`);
    // Optional: delete message if bot is admin
    // await ctx.deleteMessage();
  }
});

// === Admin commands ===
bot.command('status', (ctx) => {
  ctx.reply(`📊 Total flagged messages: ${db.data.logs.length}`);
});

bot.command('reports', (ctx) => {
  let msg = '📄 Reports:\n';
  db.data.logs.forEach((r, i) => {
    msg += `${i+1}. ${r.user}: "${r.message}"\n`;
  });
  ctx.reply(msg || 'No reports yet!');
});

// === Start Bot ===
bot.launch();
console.log('✅ Copyright Bot is running...');
