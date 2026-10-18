import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
const PORT = process.env.PORT || 10000;

app.disable('x-powered-by');

app.use(helmet({
  crossOriginResourcePolicy: false
}));

app.use(cors({
  origin: [
    'https://leadpilot-pros.netlify.app',
    'https://www.leadpilot-pros.netlify.app'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '100kb' }));

// Проверка работы сервера
app.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'no-store');

  res.json({
    status: 'ok',
    message: 'LeadPilot Backend is alive!',
    aiConfigured: Boolean(process.env.GEMINI_API_KEY)
  });
});

// Генерация сообщения через Gemini
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body || {};

    if (typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({
        error: 'Не передан текст для генерации'
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: 'На сервере не настроен GEMINI_API_KEY'
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash'
    });

    const result = await model.generateContent(prompt.trim());

    const response = await result.response;
    const generatedText = response.text();

    if (!generatedText || !generatedText.trim()) {
      return res.status(502).json({
        error: 'ИИ вернул пустой ответ'
      });
    }

    return res.json({
      success: true,
      result: generatedText.trim()
    });

  } catch (error) {
    console.error('Ошибка генерации ИИ:', error);

    return res.status(500).json({
      error: 'Не удалось сгенерировать сообщение',
      details: error.message
    });
  }
});

// Понятный ответ для неизвестных API-маршрутов
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'API-маршрут не найден',
    path: req.path
  });
});

// Общая обработка ошибок
app.use((err, req, res, next) => {
  console.error('Ошибка сервера:', err.message);

  res.status(500).json({
    error: 'Внутренняя ошибка сервера'
  });
});

app.listen(PORT, () => {
  console.log(`LeadPilot backend listening on port ${PORT}`);
});