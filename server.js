import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
const port = process.env.PORT || 10000;

// Максимально открытый CORS для Safari и Netlify
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
}));

app.use(express.json());

// Проверка статуса сервера
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'LeadPilot Backend is alive!',
    aiConfigured: !!process.env.GEMINI_API_KEY 
  });
});

// Обработчик генерации (принимает и /api/generate, и /api/chat на всякий случай)
app.post(['/api/generate', '/api/chat'], async (req, res) => {
  try {
    // Ищем текст в разных возможных полях (prompt, text, message)
    const promptText = req.body.prompt || req.body.text || req.body.message;

    if (!promptText) {
      return res.status(400).json({ error: 'Нет текста для генерации' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Ключ GEMINI_API_KEY не найден' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // Используем актуальную модель
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(promptText);
    const response = await result.response;
    const text = response.text();

    res.json({ result: text });
  } catch (error) {
    console.error("Ошибка ИИ:", error);
    res.status(500).json({ error: 'Ошибка при запросе к ИИ', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`LeadPilot backend listening on port ${port}`);
});
