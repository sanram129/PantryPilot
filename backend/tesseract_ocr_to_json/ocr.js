// ocr.js
import fs from 'fs';
import Tesseract from 'tesseract.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

async function runOCR(imagePath) {
    console.log('Starting Tesseract OCR...');
    const { data: { text } } = await Tesseract.recognize(
        imagePath,
        'eng',
    );

    return text;
}

async function parseWithGemini(rawText, model) {
    console.log('\nSending text to Gemini AI for structured parsing...');

    const prompt = [
        {
            text: `You are a smart receipt parser. I will provide you raw text from a grocery store receipt. \n\n

            Your task is to extract only the **type of item purchased**, correcting any obvious OCR spelling mistakes and ignoring brand names. 
            If the flavor or type detail is present, include it. Also include the **quantity** exactly as shown. 
            Additionally, make an inference on the unit of the item purchased that would make sense for the quantity and item presented.\n\n

            Output the data as a JSON array of objects, each with the following keys:\n
            - "item": the corrected item type (brand names removed). If necessary, include the unit you came up with earlier,\n
            - "quantity": number of units purchased\n\n

            If, after simplification, multiple items with the same name exist, combine them before outputting the final JSON and sum their quantities.

            Do not include subtotal, tax, total, store info, or any other metadata.\n\n

            Here is the receipt text:\n\n${rawText}`
        }
    ];

    const response = await model.generateContent(prompt);

    // Remove code block markers if present
    const geminiOutput = response.response.text().replace(/^```json\s*/, '').replace(/```$/, '')

    try {
        const structuredData = JSON.parse(geminiOutput);
        console.log('\n=== Parsed Receipt JSON ===\n');
        console.log(structuredData);

        return structuredData;
    } catch (err) {
        console.error('Failed to parse Gemini output as JSON:', err);
        console.log('Raw Gemini output:', response.response.text());

        return " ";
    }
}

function writeJsonToFile(jsonData, filePath) {
    try {
        fs.writeFileSync(filePath, jsonData, 'utf8');
        console.log(`File saved to ${filePath}`);
    } catch (err) {
        console.error('Error writing file:', err);
    }
}

export async function imageToJson(imagePath) {
    dotenv.config();

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const rawText = await runOCR(imagePath);
    const receipt_json = await parseWithGemini(rawText, model);

    writeJsonToFile(JSON.stringify(receipt_json), "./receipt_json_files/receipt.json");

    return receipt_json;
}

