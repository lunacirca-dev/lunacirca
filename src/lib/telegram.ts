type TelegramEnv = {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
};

type TelegramPayload = {
  chat_id: string;
  text: string;
  disable_web_page_preview: boolean;
};

const resolveConfig = (env: TelegramEnv) => {
  const botToken = (env.TELEGRAM_BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  const chatId = (env.TELEGRAM_CHAT_ID ?? process.env.TELEGRAM_CHAT_ID ?? '').trim();
  return { botToken, chatId };
};

export async function sendTelegramNotification(
  env: TelegramEnv,
  message: string
): Promise<boolean> {
  const text = message.trim();
  const { botToken, chatId } = resolveConfig(env);
  if (!botToken || !chatId || !text) {
    console.warn('[telegram] skipped notification', {
      hasToken: Boolean(botToken),
      hasChatId: Boolean(chatId),
      hasMessage: Boolean(text),
    });
    return false;
  }

  const payload: TelegramPayload = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const snippet = await response
        .clone()
        .text()
        .then((textBody) => textBody.slice(0, 500))
        .catch(() => '');
      console.error('[telegram] send failed', { status: response.status, body: snippet });
      return false;
    }

    return true;
  } catch (error) {
    console.error('[telegram] send error', error);
    return false;
  }
}
