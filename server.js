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

// --- Почта ---
const getMailConfig = () => {
  const service = process.env.EMAIL_SERVICE || 'mail';
  if (service === 'yandex') return { host: 'smtp.yandex.ru', port: 465, secure: true };
  return { host: 'smtp.mail.ru', port: 465, secure: true };
};

const transporter = nodemailer.createTransport({
  ...getMailConfig(),
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// --- Health Check ---
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    ai: !!process.env.GEMINI_API_KEY, 
    tg: !!process.env.TELEGRAM_BOT_TOKEN, 
    email: !!process.env.EMAIL_USER,
    hunter: 'active' // Показывает, что маршрут охотника существует
  });
});

// --- Генерация текста ---
app.post(['/api/generate', '/api/chat'], async (req, res) => {
  try {
    const promptText = req.body.prompt || req.body.text || req.body.message;
    if (!promptText) return res.status(400).json({ error: 'Нет текста' });
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });
    const result = await model.generateContent(promptText);
    res.json({ success: true, result: result.response.text() });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка ИИ', details: error.message });
  }
});

// --- Отправка в Telegram ---
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

// --- Массовая Email-рассылка ---
app.post('/api/send-email', async (req, res) => {
  try {
    const { emails, subject, text } = req.body;
    if (!emails || !emails.length) return res.status(400).json({ error: 'Нет email-ов' });

    let sentCount = 0;
    for (const email of emails) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email.trim(),
        subject: subject || 'Предложение о сотрудничестве',
        text: text
      };
      await transporter.sendMail(mailOptions);
      sentCount++;
      await new Promise(r => setTimeout(r, 2000));
    }
    res.json({ success: true, message: `Отправлено на ${sentCount} адресов.` });
  } catch (e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// --- Охотник (Парсинг веб-версий ТГ-каналов) ---
async function runHunter() {
  console.log("Сканируем каналы...");
  const channels = ['freelancetaverna', 'normrabota', 'zapwork']; 

  try {
    for (const ch of channels) {
      const url = `https://t.me/s/${ch}`;
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);

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

// --- Маршрут для ручного запуска Охотника ---
app.get('/api/hunt', (req, res) => {
  runHunter();
  res.json({ status: 'Сканирую...' });
});

// Запускаем охотника раз в час
setInterval(runHunter, 3600000);

app.listen(port, () => console.log(`Server running on ${port}`));