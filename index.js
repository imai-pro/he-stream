const express = require('express');
const axios = require('axios');
const { addonBuilder } = require('stremio-addon-sdk');

// API keys and constants from environment variables
const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;
const OPENSUBTITLES_API_KEY = process.env.OPENSUBTITLES_API_KEY; // New API key variable
const OPENSUBTITLES_API = 'https://api.opensubtitles.com/api/v1/subtitles';

// Stremio addon manifest
const manifest = {
    id: 'org.stremio.translated-subtitles',
    version: '1.1.0',
    name: 'Hebrew Subtitles Translator (EN to HE)',
    description: 'Provides Hebrew subtitles and translates if needed.',
    resources: ['subtitles'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [],
};

// Initialize addon builder
const builder = new addonBuilder(manifest);

// Subtitles handler
builder.defineSubtitlesHandler(async ({ id }) => {
    try {
        console.log(`Fetching subtitles for ${id}...`);

        // Set headers for OpenSubtitles API
        const headers = { 'Api-Key': OPENSUBTITLES_API_KEY };

        // Step 1: Check for Hebrew subtitles
        const hebrewResponse = await axios.get(
            `${OPENSUBTITLES_API}?imdb_id=${id}&languages=he`,
            { headers }
        );
        console.log('Hebrew subtitles response:', hebrewResponse.data);

        const hebrewSubtitles = hebrewResponse.data.data;
        if (hebrewSubtitles && hebrewSubtitles.length > 0) {
            console.log('Returning Hebrew subtitles.');
            return {
                subtitles: hebrewSubtitles.map(sub => ({
                    id: sub.attributes.url,
                    lang: 'he',
                    url: sub.attributes.url,
                    title: 'Hebrew (Original)',
                })),
            };
        }

        console.log('No Hebrew subtitles found. Fetching English subtitles.');

        // Step 2: Fetch English subtitles if Hebrew ones are not available
        const englishResponse = await axios.get(
            `${OPENSUBTITLES_API}?imdb_id=${id}&languages=en`,
            { headers }
        );
        console.log('English subtitles response:', englishResponse.data);

        const englishSubtitles = englishResponse.data.data[0];
        if (!englishSubtitles) throw new Error('No English subtitles found.');

        const subtitleContent = await axios.get(englishSubtitles.attributes.url, {
            responseType: 'text',
        });
        console.log('Subtitle content fetched successfully.');

        // Step 3: Translate the English subtitles to Hebrew
        const translated = await translateText(subtitleContent.data, 'en', 'he');
        console.log('Translation complete.');

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
        console.error('Error in subtitles handler:', error);
        return { subtitles: [] };
    }
});

// Helper function to translate text using Google Translate API
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

// Set up Express server and integrate the Stremio addon
const app = express();
const port = process.env.PORT || 7000;

try {
    const addonInterface = builder.getInterface();

    // Serve manifest.json and other routes properly
    app.get('/manifest.json', (req, res) => {
        res.json(addonInterface.manifest);
    });
    app.get('/resource/:resource/:type/:id.json', async (req, res) => {
    const { resource, type, id } = req.params;
    console.log(`Resource request: resource=${resource}, type=${type}, id=${id}`);

    try {
        const response = await addonInterface.get({ resource, type, id });
        console.log('Handler response:', response);
        res.json(response);
    } catch (error) {
        console.error('Error handling request:', error);
        res.status(500).json({ error: error.message });
    }
});


    app.get('/resource/:resource/:type/:id.json', (req, res) => {
        const { resource, type, id } = req.params;
        addonInterface.get({ resource, type, id })
            .then(response => res.json(response))
            .catch(error => res.status(500).json({ error: error.message }));
    });

    // Start the server
    app.listen(port, () => console.log(`Addon running on http://localhost:${port}`));
} catch (error) {
    console.error('Failed to start the server:', error);
}
