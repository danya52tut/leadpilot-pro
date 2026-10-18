import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import TelegramBot from 'node-telegram-bot-api';
import nodemailer from 'nodemailer';
import axios from 'axios';
import * as cheerio from 'cheerio';

const app = express();
const port = process.env.PORT || 10000;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '10mb' }));

let bot = null;
if (process.env.TELEGRAM_BOT_TOKEN) {
  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
}
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

// Настройка почты (Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS // Это пароль приложения, не обычный пароль от почты!
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ai: !!process.env.GEMINI_API_KEY, tg: !!process.env.TELEGRAM_BOT_TOKEN, email: !!process.env.EMAIL_USER });
});

// 1. Генерация текста
app.post('/api/generate', async (req, res) => {
  try {
    const prompt = req.body.prompt || req.body.text;
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });
    const result = await model.generateContent(prompt);
    res.json({ success: true, result: result.response.text() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Массовая отправка Email
app.post('/api/send-email', async (req, res) => {
  try {
    const { emails, subject, bodyTemplate } = req.body;
    if (!emails || !emails.length) return res.status(400).json({ error: 'Нет email-ов' });

    let sentCount = 0;
    for (const email of emails) {
      // В реальности тут нужно генерить персональный текст, но для примера шлем шаблон
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: subject,
        text: bodyTemplate
      };
      await transporter.sendMail(mailOptions);
      sentCount++;
      await new Promise(r => setTimeout(r, 2000)); // Пауза 2 сек, чтобы Gmail не забанил
    }
    res.json({ success: true, message: `Отправлено на ${sentCount} адресов.` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Охотник (Парсинг веб-версий ТГ-каналов)
async function runHunter() {
  console.log("Сканируем каналы...");
  // Список открытых каналов/чатов, где ищут заказы
  const channels = ['freelancetaverna', 'normrabota', 'zapwork']; 

  try {
    for (const ch of channels) {
      const url = `https://t.me/s/${ch}`; // Веб-версия канала
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);

      // Берем последние 3 сообщения
      const messages = $('.tgme_widget_message_text').slice(-3);

      messages.each(async (i, el) => {
        const text = $(el).text();
        if (/сайт|бот|верстка|дизайн|автоматизац/i.test(text)) {
          
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
          const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });
          const prompt = `Заказчик пишет: "${text}". Напиши мне короткий, цепляющий ответ в TG (предлагаю услуги веб-разработки и ботов).`;
          const aiResult = await model.generateContent(prompt);
          
          if (bot && ADMIN_CHAT_ID) {
            await bot.sendMessage(ADMIN_CHAT_ID, `🎯 <b>Лид из @${ch}!</b>\n\nТекст: ${text}\n\n<b>Ответ:</b>\n${aiResult.response.text()}`, { parse_mode: 'HTML' });
          }
        }
      });
    }
  } catch (e) { console.error("Ошибка охотника:", e.message); }
}

// Запускаем охотника раз в час (3600000 мс)
setInterval(runHunter, 3600000);
app.get('/api/hunt', (req, res) => { runHunter(); res.json({ status: 'Сканирую...' }); });

app.listen(port, () => console.log(`Server running on ${port}`));