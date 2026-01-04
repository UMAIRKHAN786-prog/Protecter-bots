import { Telegraf, Markup } from 'telegraf';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

// === Database setup ===
const adapter = new JSONFile('gc_data.json');
const db = new Low(adapter);
await db.read();
db.data ||= { users: {}, logs: [] };
await db.write();

// === Bot token from environment variable ===
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN is not defined in environment variables!");

const bot = new Telegraf(BOT_TOKEN);

// === Config ===
const antiLinks = true; // delete messages with links
const maxWarns = 3; // after 3 warns, user gets kicked

// === Start Command ===
bot.start((ctx) => ctx.reply(`👋 Hello ${ctx.from.first_name}! I'm your Group Manager Bot!`));

// === Welcome / Goodbye Messages ===
bot.on('new_chat_members', (ctx) => {
  ctx.message.new_chat_members.forEach(user => {
    ctx.reply(`✨ Welcome ${user.first_name} to ${ctx.chat.title}!`);
  });
});

bot.on('left_chat_member', (ctx) => {
  ctx.reply(`❌ ${ctx.message.left_chat_member.first_name} left the group.`);
});

// === Anti-link / spam detection ===
bot.on('message', async (ctx) => {
  const text = ctx.message.text || '';
  const userId = ctx.from.id;

  // Ignore admins
  const member = await ctx.getChatMember(userId);
  if (['administrator', 'creator'].includes(member.status)) return;

  // Anti-link
  if (antiLinks && text.match(/https?:\/\/\S+/i)) {
    await ctx.deleteMessage();
    ctx.reply(`⚠️ ${ctx.from.first_name}, links are not allowed!`);
    
    // Warn user
    db.data.users[userId] ||= { warns: 0 };
    db.data.users[userId].warns += 1;
    await db.write();
    
    if (db.data.users[userId].warns >= maxWarns) {
      try {
        await ctx.kickChatMember(userId);
        ctx.reply(`🚫 ${ctx.from.first_name} has been kicked after ${maxWarns} warnings.`);
        db.data.users[userId].warns = 0; // reset warns
        await db.write();
      } catch(e) {
        console.log('Cannot kick:', e.message);
      }
    }
  }
});

// === Admin commands ===

// /warn @user
bot.command('warn', async (ctx) => {
  if (!ctx.message.reply_to_message) return ctx.reply('Reply to a user to warn them.');
  const userId = ctx.message.reply_to_message.from.id;
  db.data.users[userId] ||= { warns: 0 };
  db.data.users[userId].warns += 1;
  await db.write();
  ctx.reply(`⚠️ ${ctx.message.reply_to_message.from.first_name} has been warned (${db.data.users[userId].warns}/${maxWarns}).`);

  if (db.data.users[userId].warns >= maxWarns) {
    try {
      await ctx.kickChatMember(userId);
      ctx.reply(`🚫 ${ctx.message.reply_to_message.from.first_name} has been kicked after ${maxWarns} warnings.`);
      db.data.users[userId].warns = 0;
      await db.write();
    } catch(e) {
      ctx.reply('❌ Cannot kick user. Make sure I am admin.');
    }
  }
});

// /mute @user duration in minutes
bot.command('mute', async (ctx) => {
  if (!ctx.message.reply_to_message) return ctx.reply('Reply to a user to mute them.');
  const userId = ctx.message.reply_to_message.from.id;
  const args = ctx.message.text.split(' ');
  const duration = parseInt(args[1]) || 10; // default 10 mins
  try {
    await ctx.restrictChatMember(userId, {
      permissions: { can_send_messages: false },
      until_date: Math.floor(Date.now()/1000) + duration*60
    });
    ctx.reply(`🔇 ${ctx.message.reply_to_message.from.first_name} muted for ${duration} minutes.`);
  } catch(e) {
    ctx.reply('❌ Cannot mute user. Make sure I am admin.');
  }
});

// /unmute @user
bot.command('unmute', async (ctx) => {
  if (!ctx.message.reply_to_message) return ctx.reply('Reply to a user to unmute them.');
  const userId = ctx.message.reply_to_message.from.id;
  try {
    await ctx.restrictChatMember(userId, {
      permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true }
    });
    ctx.reply(`🔊 ${ctx.message.reply_to_message.from.first_name} has been unmuted.`);
  } catch(e) {
    ctx.reply('❌ Cannot unmute user. Make sure I am admin.');
  }
});

// /kick @user
bot.command('kick', async (ctx) => {
  if (!ctx.message.reply_to_message) return ctx.reply('Reply to a user to kick them.');
  const userId = ctx.message.reply_to_message.from.id;
  try {
    await ctx.kickChatMember(userId);
    ctx.reply(`🚫 ${ctx.message.reply_to_message.from.first_name} has been kicked.`);
  } catch(e) {
    ctx.reply('❌ Cannot kick user. Make sure I am admin.');
  }
});

// /ban @user
bot.command('ban', async (ctx) => {
  if (!ctx.message.reply_to_message) return ctx.reply('Reply to a user to ban them.');
  const userId = ctx.message.reply_to_message.from.id;
  try {
    await ctx.kickChatMember(userId);
    ctx.reply(`⛔ ${ctx.message.reply_to_message.from.first_name} has been banned.`);
  } catch(e) {
    ctx.reply('❌ Cannot ban user. Make sure I am admin.');
  }
});

// /warns @user
bot.command('warns', async (ctx) => {
  if (!ctx.message.reply_to_message) return ctx.reply('Reply to a user to check warns.');
  const userId = ctx.message.reply_to_message.from.id;
  const warns = db.data.users[userId]?.warns || 0;
  ctx.reply(`⚠️ ${ctx.message.reply_to_message.from.first_name} has ${warns}/${maxWarns} warnings.`);
});

// === Start Bot ===
bot.launch();
console.log('✅ Rose-style GC Management Bot is running...');
