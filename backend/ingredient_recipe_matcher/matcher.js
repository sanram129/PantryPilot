// matcher.js
// Matches the ingredients in the pantry with most probable recipes using Gemini

import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

async function getPantry(userID, db) {
    // Array to store pantry items
    const pantryArray = [];

    // Each of the recipe collections on firebase
    const pantryRef = db.collection("users").doc(userID).collection("pantry");

    // Get documents
    const querySnapshot = await pantryRef.get();

    querySnapshot.forEach((doc) => {
        pantryArray.push({ id: doc.id, ...doc.data() });
    });

    return pantryArray;
}

async function getIngredients(db) {
    // Array to store items
    const ingredientsArray = [];

    // Each of the ingredient collections on firebase
    // We only need the recipe IDs and the ingredients for them
    const ingredientsRef = db.collection("ingredients");

    // Get documents
    const queryIngSnapshot = await ingredientsRef.get();

    queryIngSnapshot.forEach((doc) => {
        ingredientsArray.push({ id: doc.id, ...doc.data() });
    });

    return ingredientsArray;
}

export async function getRankedRecipes(userID, db) {
    // Get required data from firebase
    const userPantry = await getPantry(userID, db);
    const userIngredients = await getIngredients(db);

    // Store a array of JSON objects that gives the ingredients for each recipe
    const ingredientsPerRecipe = [];

    // Format the ingredients
    const formattedPantry = [];

    userPantry.forEach((item) => {
        formattedPantry.push(item.item);
    });

    // Add empty objects to the array
    for (var i = 1; i <= 20; i++) {
        ingredientsPerRecipe.push({ recipe_id: i, ingredients: [] });
    }

    // For each ingredient, get the object from the array for the recipe it matches with
    userIngredients.forEach((ingredient) => {
        const currentRecipe = ingredientsPerRecipe.find(obj => obj.recipe_id == ingredient.recipe_id);

        // Add this ingredient to its respective array
        currentRecipe.ingredients.push(ingredient.ingredient_name);
    });

    // Set up the AI model
    dotenv.config();

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    console.log("Invoking gemini AI:");

    // Create the prompt to pass to Gemini
    const prompt = [
        {
            text: `You are a smart recipe finder. I will provide you with a list of ingredients I have in my pantry, as well as a list of recipes with an ID number and the ingredients that they use.


                    Your task is to compare the recipes against the pantry items and rank the recipes based on how well they can be made with the current pantry.
                    Your ranking needs to be determined as follows
                    - A recipe gets a higher score if more of its ingredients are available in the pantry. This does not need to be an exact match.
                    - If some ingredients are missing, the recipe should still appear but ranked lower.
                    - In order for a recipe to go in the final array, at least ONE ingredient should be available (but doesn't need to match exactly).
                    - However, if nothing matches, suggest at least ONE recipe. At most, suggest FIVE recipes. Randomize the order if nothing matches too.
                    - Output ONLY an array of recipe IDs. Nothing else. No fluff, no explanations, just an array.
                    - This array should be sorted in order from highest ranked to least.

                    **Example output format:**
                    [ 2, 1 ]

                    Generate the ranking JSON based on the following input.
                    
                    Here is the recipes JSON: ${JSON.stringify(ingredientsPerRecipe)} \n

                    Here is the pantry JSON: ${formattedPantry}\n`

        }
    ];

    // Get a string containing the response
    const response = (await model.generateContent(prompt)).response.text()
        .replace(/^```json\s*/, '').replace(/```$/, '');

    console.log(JSON.parse(response));

    return JSON.parse(response);
}