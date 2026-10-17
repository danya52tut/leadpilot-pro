const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 10000;

// РАЗРЕШАЕМ ПОДКЛЮЧЕНИЯ ОТОВСЮДУ (чтобы Netlify точно пробился)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// 1. Проверка, что сервер живой (сюда стучится кнопка на сайте)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'LeadPilot Backend is alive!' });
});

// 2. Эндпоинт для генерации текста через ИИ
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Нет текста для генерации (prompt)' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Ключ GEMINI_API_KEY не найден в настройках' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // Используем быструю и бесплатную модель
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    res.json({ result: text });
  } catch (error) {
    console.error("Ошибка ИИ:", error);
    res.status(500).json({ error: 'Ошибка при запросе к ИИ', details: error.message });
  }
});

// Запуск сервера
app.listen(port, () => {
  console.log(`LeadPilot backend listening on ${port}`);
});
