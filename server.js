import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
const port = process.env.PORT || 10000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
}));

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'LeadPilot Backend is alive!',
    aiConfigured: !!process.env.GEMINI_API_KEY
  });
});

app.post(['/api/generate', '/api/chat'], async (req, res) => {
  try {
    const promptText = req.body.prompt || req.body.text || req.body.message;
    if (!promptText) {
      return res.status(400).json({ error: 'Нет текста для генерации' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Ключ GEMINI_API_KEY не найден' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // АКТУАЛЬНАЯ МОДЕЛЬ — gemini-3.8-flash
    const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });

    const result = await model.generateContent(promptText);
    const response = await result.response;
    const text = response.text();

    res.json({ success: true, result: text });
  } catch (error) {
    console.error("Ошибка ИИ:", error);
    res.status(500).json({ error: 'Ошибка при запросе к ИИ', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`LeadPilot backend listening on port ${port}`);
});