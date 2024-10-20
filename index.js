const express = require('express');
const axios = require('axios');
const { addonBuilder } = require('stremio-addon-sdk');

// Ensure your API key is available in the environment
const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;
const OPENSUBTITLES_API = 'https://api.opensubtitles.org/api/v1/subtitles';

// Stremio addon manifest
const manifest = {
    id: 'org.stremio.translated-subtitles',
    version: '1.1.0',
    name: 'Hebrew Subtitles Translator (EN to HE)',
    description: 'Provides Hebrew subtitles and translates if needed.',
    resources: ['subtitles'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [], // Must be an array, even if empty
};

// Initialize the addon builder
const builder = new addonBuilder(manifest);

// Define the subtitles handler
builder.defineSubtitlesHandler(async ({ id }) => {
    try {
        console.log(`Fetching subtitles for ${id}...`);

        // Step 1: Check for Hebrew subtitles
        const hebrewResponse = await axios.get(`${OPENSUBTITLES_API}?imdb_id=${id}&languages=he`);
        const hebrewSubtitles = hebrewResponse.data.data;

        if (hebrewSubtitles && hebrewSubtitles.length > 0) {
            console.log('Hebrew subtitles found. Returning them.');
            return {
                subtitles: hebrewSubtitles.map((sub) => ({
                    id: sub.attributes.url,
                    lang: 'he',
                    url: sub.attributes.url,
                    title: 'Hebrew (Original)',
                })),
            };
        }

        console.log('No Hebrew subtitles found. Fetching English subtitles.');

        // Step 2: Fetch English subtitles if Hebrew ones are not available
        const englishResponse = await axios.get(`${OPENSUBTITLES_API}?imdb_id=${id}&languages=en`);
        const englishSubtitles = englishResponse.data.data[0];

        if (!englishSubtitles) throw new Error('No English subtitles found.');

        // Step 3: Translate English subtitles to Hebrew
        const subtitleContent = await axios.get(englishSubtitles.attributes.url, {
            responseType: 'text',
        });

        console.log('Translating English subtitles to Hebrew...');
        const translated = await translateText(subtitleContent.data, 'en', 'he');
        console.log('Translation complete.');

        // Step 4: Return the translated subtitles
        return {
            subtitles: [
                {
                    id: 'hebrew-translation',
                    lang: 'he',
                    url: `data:text/plain;base64,${Buffer.from(translated).toString('base64')}`,
                    title: 'Hebrew (Translated)',
                },
            ],
        };
    } catch (error) {
        console.error('Error fetching or translating subtitles:', error);
        return { subtitles: [] };
    }
});

// Helper function for Google Translate API
async function translateText(text, sourceLang, targetLang) {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`;
    const response = await axios.post(url, {
        q: text,
        source: sourceLang,
        target: targetLang,
        format: 'text',
    });

    return response.data.data.translations[0].translatedText;
}

// Start the Express server and integrate the Stremio addon
const app = express();
const port = process.env.PORT || 7000;

try {
    const addonInterface = builder.getInterface();
    if (typeof addonInterface !== 'function') {
        throw new Error('addonInterface is not a valid middleware function.');
    }

    app.use('/', addonInterface); // Ensure it's used as a middleware function

    app.listen(port, () => console.log(`Addon running on http://localhost:${port}`));
} catch (error) {
    console.error('Failed to start the server:', error);
}
