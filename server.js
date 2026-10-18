import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import TelegramBot from 'node-telegram-bot-api';

const app = express();
const port = process.env.PORT || 10000;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());

let bot = null;
if (process.env.TELEGRAM_BOT_TOKEN) {
  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', aiConfigured: !!process.env.GEMINI_API_KEY, tgConfigured: !!process.env.TELEGRAM_BOT_TOKEN });
});

app.post(['/api/generate', '/api/chat'], async (req, res) => {
  try {
    const promptText = req.body.prompt || req.body.text || req.body.message;
    if (!promptText) return res.status(400).json({ error: 'Нет текста' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });
    const result = await model.generateContent(promptText);
    const text = result.response.text();

    res.json({ success: true, result: text });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка ИИ', details: error.message });
  }
});

app.post('/api/send-telegram', async (req, res) => {
  try {
    const { chatId, message } = req.body;
    
    if (!bot) return res.status(500).json({ error: 'Бот не настроен (нет токена)' });
    if (!chatId || !message) return res.status(400).json({ error: 'Нужны chatId и message' });

    await bot.sendMessage(chatId, message);
    res.json({ success: true, message: 'Сообщение отправлено!' });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка отправки в ТГ', details: error.message });
  }
});

app.listen(port, () => console.log(`LeadPilot backend listening on port ${port}`));