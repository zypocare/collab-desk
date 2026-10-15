// Telegram messages to the creator's phone (free). Needs TELEGRAM_BOT_TOKEN from @BotFather.
const token = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
export const telegramConfigured = token !== '';

async function call(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.description ?? `Telegram ${method} failed`);
  return json.result;
}

export function sendTelegram(chatId: string, html: string) {
  if (!telegramConfigured) throw new Error('TELEGRAM_BOT_TOKEN is not set.');
  return call('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true });
}

/** Finds the chat that sent "/start <code>" to the bot recently. */
export async function findChatByCode(code: string): Promise<string | null> {
  if (!telegramConfigured) throw new Error('TELEGRAM_BOT_TOKEN is not set.');
  const updates = (await call('getUpdates', { limit: 100, allowed_updates: ['message'] })) as {
    message?: { text?: string; chat: { id: number } };
  }[];
  for (const u of updates.reverse()) {
    if (u.message?.text?.trim() === `/start ${code}`) return String(u.message.chat.id);
  }
  return null;
}

export async function botUsername(): Promise<string> {
  if (!telegramConfigured) return '';
  const me = (await call('getMe', {})) as { username: string };
  return me.username;
}
