import express from "express";
import cors from "cors";
import helmet from "helmet";
import Parser from "rss-parser";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();
const app=express(), parser=new Parser({timeout:15000});
app.use(helmet({crossOriginResourcePolicy:{policy:"cross-origin"}}));
app.use(cors({origin:(process.env.ALLOWED_ORIGIN||"").split(",").filter(Boolean)}));
app.use(express.json({limit:"1mb"}));
app.get("/api/health",(_req,res)=>res.json({status:"ok",aiConfigured:Boolean(process.env.GEMINI_API_KEY)}));
app.post("/api/draft",async(req,res)=>{
  try{
    if(!process.env.GEMINI_API_KEY) return res.status(503).json({error:"AI is not configured"});
    const {lead={},offer="",target="",benefit="",pilot=""}=req.body||{};
    const genAI=new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model=genAI.getGenerativeModel({model:process.env.GEMINI_MODEL||"gemini-2.5-flash"});
    const prompt=`Ты — B2B-исследователь и редактор деловых сообщений. Создай короткое русскоязычное первое сообщение для потенциального клиента.
Правила: не выдумывай факты, результаты, кейсы, публикации и знакомство; опирайся только на поля ниже. Если сигнал слабый/гипотетический, честно сформулируй это как гипотезу или попроси разрешение прислать идею. Не обещай гарантированный рост продаж. Без манипуляций, без навязчивости, 70-120 слов. Один ясный CTA, уважительный отказ.
Целевой клиент: ${target}
Предложение: ${offer}
Польза/гипотеза: ${benefit}
Пилот: ${pilot}
Компания: ${lead.company}
Ниша: ${lead.niche}
Город: ${lead.city}
Сайт: ${lead.website}
Публичный контакт: ${lead.contact}
Сигнал/факт, введённый оператором: ${lead.signal}
Заметка/доказательство: ${lead.note}
Источник: ${lead.source}
Верни только текст сообщения, без заголовков и пояснений.`;
    const result=await model.generateContent(prompt);
    res.json({draft:result.response.text().trim()});
  }catch(e){console.error("draft error",e.message);res.status(500).json({error:"Draft generation failed"});}
});
app.post("/api/rss/check",async(req,res)=>{
  try{
    if(process.env.RSS_MONITOR_ENABLED!=="true") return res.status(503).json({error:"RSS monitoring is disabled; set RSS_MONITOR_ENABLED=true"});
    const {sources=[]}=req.body||{}; if(!Array.isArray(sources)||sources.length>20) return res.status(400).json({error:"Send up to 20 RSS sources"});
    const found=[];
    for(const s of sources){
      if(!s.url||!/^https?:\/\//i.test(s.url)) continue;
      try{
        const feed=await parser.parseURL(s.url);
        const words=String(s.keywords||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
        for(const item of (feed.items||[]).slice(0,50)){
          const text=[item.title,item.contentSnippet,item.content].join(" ").toLowerCase();
          if(words.length&&!words.some(w=>text.includes(w))) continue;
          found.push({source:s.name||feed.title,title:item.title||"",url:item.link||"",published:item.isoDate||item.pubDate||"",snippet:(item.contentSnippet||"").slice(0,500)});
        }
      }catch(e){found.push({source:s.name||s.url,error:"Could not read this feed"});}
    }
    res.json({checkedAt:new Date().toISOString(),count:found.length,items:found});
  }catch(e){res.status(500).json({error:"RSS check failed"});}
});
const port=Number(process.env.PORT||3000);
app.listen(port,()=>console.log(`LeadPilot backend listening on ${port}`));
