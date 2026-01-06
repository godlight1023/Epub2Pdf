import { GoogleGenAI, Type } from "@google/genai";
import { SummaryResult, Language } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const summarizeBookContent = async (textChunk: string, language: Language = 'en'): Promise<SummaryResult> => {
  try {
    const prompt = language === 'zh'
      ? `分析以下书籍摘录（文本开头），提供简明摘要、缺失的标题以及3个关键主题/关键词。请用中文回答。\n\n摘录：\n${textChunk.substring(0, 5000)}`
      : `Analyze the following book excerpt (beginning of the text) and provide a concise summary, a title if missing, and 3 key themes/keywords. \n\nExcerpt:\n${textChunk.substring(0, 5000)}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            keywords: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["title", "summary", "keywords"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as SummaryResult;
  } catch (error) {
    console.error("Gemini summarization failed:", error);
    return {
      title: language === 'zh' ? "未知标题" : "Unknown Title",
      summary: language === 'zh' ? "暂时无法生成摘要。" : "Could not generate summary at this time.",
      keywords: ["Error"]
    };
  }
};