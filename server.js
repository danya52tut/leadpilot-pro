import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import TelegramBot from 'node-telegram-bot-api';
import Parser from 'rss-parser';

const app = express();
const port = process.env.PORT || 10000;
const parser = new Parser();

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());

let bot = null;
if (process.env.TELEGRAM_BOT_TOKEN) {
  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
}

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // Твой ID для уведомлений
let isHunting = false;

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', aiConfigured: !!process.env.GEMINI_API_KEY, tgConfigured: !!process.env.TELEGRAM_BOT_TOKEN });
});

// 1. Генерация текста (как было)
app.post('/api/generate', async (req, res) => {
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

// 2. Отправка в Telegram (как было)
app.post('/api/send-telegram', async (req, res) => {
  try {
    const { chatId, message } = req.body;
    if (!bot) return res.status(500).json({ error: 'Бот не настроен' });
    await bot.sendMessage(chatId, message);
    res.json({ success: true, message: 'Отправлено!' });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка ТГ', details: error.message });
  }
});

// 3. ФУНКЦИЯ ОХОТНИКА (Парсинг RSS-лент с заказами)
async function runHunter() {
  if (isHunting) return;
  isHunting = true;
  console.log("Охотник начал проверку лент...");

  // Ссылки на RSS-ленты с заказами (можно менять)
  const feeds = [
    'https://www.fl.ru/rss/all.xml?category=11', // Пример: дизайн на FL.ru
    'https://freelance.ru/rss/feed.xml' // Пример: Freelance.ru
  ];

  try {
    for (const feedUrl of feeds) {
      const feed = await parser.parseURL(feedUrl);
      // Берем 3 последних заказа для теста
      const latestItems = feed.items.slice(0, 3); 

      for (const item of latestItems) {
        // Проверяем, есть ли ключевые слова (например, "сайт", "дизайн", "бот")
        const textToAnalyze = item.title + ' ' + item.contentSnippet;
        if (/сайт|дизайн|бот|автоматизац/i.test(textToAnalyze)) {
          
          // Генерим ответ через ИИ
          const prompt = `Ты эксперт по продажам. Клиент написал: "${textToAnalyze}". Напиши короткое, дружелюбное сообщение от моего лица (предлагаю создание сайтов и автоматизацию). Задай вопрос в конце.`;
          
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
          const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });
          const result = await model.generateContent(prompt);
          const aiText = result.response.text();

          // Отправляем тебе в ТГ
          if (bot && ADMIN_CHAT_ID) {
            const message = `🎯 <b>Новый лид!</b>\n\n<b>Задача:</b> ${item.title}\n<b>Ссылка:</b> ${item.link}\n\n<b>Готовый ответ от ИИ:</b>\n${aiText}`;
            await bot.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: 'HTML' });
          }
        }
      }
    }
    console.log("Охотник закончил проверку.");
  } catch (error) {
    console.error("Ошибка Охотника:", error.message);
  } finally {
    isHunting = false;
  }
}

// Включаем Охотника каждые 30 минут (1800000 мс)
setInterval(runHunter, 1800000); 

app.listen(port, () => console.log(`LeadPilot backend listening on port ${port}`));