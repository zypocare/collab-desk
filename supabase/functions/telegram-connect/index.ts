// Connects the creator's Telegram to the bot, or sends a test message.
// Called from the studio settings page by the signed-in creator.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { admin } from '../_shared/admin.ts';
import { botUsername, findChatByCode, sendTelegram, telegramConfigured } from '../_shared/telegram.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Only the creator may use this.
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: isCreator } = await asUser.rpc('is_creator');
  if (isCreator !== true) return reply({ error: 'Only the creator can do this.' }, 403);

  const { action, code } = await req.json().catch(() => ({}));
  if (!telegramConfigured) {
    // Asking whether it's available isn't an error: settings show "not set up yet".
    if (action === 'info') return reply({ bot: '', configured: false });
    return reply({ error: 'Telegram is not set up yet. Add TELEGRAM_BOT_TOKEN to the server secrets (see docs/SETUP.md).' }, 400);
  }

  const db = admin();

  try {
    if (action === 'info') {
      return reply({ bot: await botUsername() });
    }
    if (action === 'connect') {
      if (!/^\d{6}$/.test(String(code ?? ''))) return reply({ error: 'Missing connection code.' }, 400);
      const chatId = await findChatByCode(String(code));
      if (!chatId) return reply({ error: `We didn't see "/start ${code}" yet. Send it to the bot, wait a few seconds and try again.` }, 404);
      await db.from('creator_settings').update({ telegram_chat_id: chatId }).eq('id', 1);
      await sendTelegram(chatId, '<b>Connected!</b> You will get your 9 AM summary here.');
      return reply({ ok: true });
    }
    if (action === 'test') {
      const { data: s } = await db.from('creator_settings').select('telegram_chat_id').eq('id', 1).single();
      if (!s?.telegram_chat_id) return reply({ error: 'Telegram is not connected yet.' }, 400);
      await sendTelegram(s.telegram_chat_id, 'Test message from your collab studio. Notifications work.');
      return reply({ ok: true });
    }
    if (action === 'disconnect') {
      await db.from('creator_settings').update({ telegram_chat_id: '' }).eq('id', 1);
      return reply({ ok: true });
    }
    return reply({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
