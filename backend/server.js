import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { imageToJson } from './tesseract_ocr_to_json/ocr.js';
import { getRankedRecipes } from './ingredient_recipe_matcher/matcher.js';

const serviceAccount = JSON.parse(fs.readFileSync("./serviceAccountKeyFirebase.json", "utf8"));

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import admin from 'firebase-admin';


// Initialize Firebase Admin SDK
initializeApp({
    credential: cert(serviceAccount),
});

const db = getFirestore();

const app = express();
const PORT = 6741;
const filePath = path.join('./receipt_json_files', 'receipt.json');

app.use(cors());
app.use(express.json()); // parse JSON request bodies

const upload = multer(); // stores files in memory

app.post('/receipt_image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        // Query for user id
        const userId = req.body.userId;

        const imageBuffer = req.file.buffer;

        // Call your function from another file
        const receiptData = await imageToJson(imageBuffer);

        if (!Array.isArray(receiptData) || receiptData.length === 0) {
            return res.status(400).json({ error: "Expected a non-empty array of receipt items." });
        }

        const userRef = db.collection("users").doc(userId).collection("pantry");

        // Write each receipt item to Firestore
        const batch = db.batch();
        receiptData.forEach(itemObj => {
            if (!itemObj.item || itemObj.quantity == null) return; // skip invalid entries
            const docRef = userRef.doc(); // auto-ID
            batch.set(docRef, {
                ingredient_name: itemObj.item,
                qty: itemObj.quantity,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        await batch.commit();

        res.json({ status: 'success', data: "Image processed and stored in JSON" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error processing image' });
    }
});

// Get anywhere from the top 1 to 5 recipes and send it to the frontend
app.get('/rankings', async (req, res) => {

    try {
        // Query for user id
        const userId = req.query.userId;

        const rankedRep = await getRankedRecipes(userId, db);
        if (!rankedRep) return res.status(400).json({ error: "Could not generate rankings." });

        res.status(200).json(rankedRep);
    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: 'Error generating rankings (either in pulling firebase data or with Gemini)',
            details: err.message
        });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://localhost:${PORT}`));