const express = require('express');
const axios = require('axios');
const { addonBuilder } = require('stremio-addon-sdk');

// Load environment variables
const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;
const OPENSUBTITLES_API_KEY = process.env.OPENSUBTITLES_API_KEY;
const OPENSUBTITLES_API = 'https://api.opensubtitles.com/api/v1/subtitles';

// Define the Stremio addon manifest
const manifest = {
    id: 'org.stremio.translated-subtitles',
    version: '1.1.0',
    name: 'Hebrew Subtitles Translator (EN to HE)',
    description: 'Provides Hebrew subtitles and translates English if needed.',
    resources: ['subtitles'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [],
};

// Initialize the addon builder
const builder = new addonBuilder(manifest);

// Define the subtitles handler
builder.defineSubtitlesHandler(async ({ type, id }) => {
    console.log(`Handling subtitles request for type=${type}, id=${id}`);

    try {
        const headers = { 'Api-Key': OPENSUBTITLES_API_KEY };

        // Step 1: Check for Hebrew subtitles
        const hebrewResponse = await axios.get(
            `${OPENSUBTITLES_API}?imdb_id=${id}&languages=he`,
            { headers }
        );
        const hebrewSubtitles = hebrewResponse.data.data;

        if (hebrewSubtitles.length > 0) {
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

        // Step 2: Fetch and translate English subtitles
        console.log('Fetching English subtitles...');
        const englishResponse = await axios.get(
            `${OPENSUBTITLES_API}?imdb_id=${id}&languages=en`,
            { headers }
        );
        const englishSubtitles = englishResponse.data.data[0];

        if (!englishSubtitles) throw new Error('No English subtitles found.');

        const subtitleContent = await axios.get(
            englishSubtitles.attributes.url,
            { responseType: 'text' }
        );

        console.log('Translating English subtitles...');
        const translated = await translateText(subtitleContent.data, 'en', 'he');

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
        console.error(`Error in subtitles handler for type=${type}, id=${id}:`, error.message);
        throw new Error(`Failed to process subtitles request for ${id}: ${error.message}`);
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

// Set up the Express server
const app = express();
const port = process.env.PORT || 7000;

const addonInterface = builder.getInterface();

// Serve the manifest.json
app.get('/manifest.json', (req, res) => {
    res.json(addonInterface.manifest);
});

// Handle resource requests with detailed error handling
app.get('/resource/:resource/:type/:id.json', async (req, res) => {
    const { resource, type, id } = req.params;
    console.log(`Received request for resource=${resource}, type=${type}, id=${id}`);

    try {
        const response = await addonInterface.get({ resource, type, id });
        res.json(response);
    } catch (error) {
        console.error(
            `Error processing request for resource=${resource}, type=${type}, id=${id}:`,
            error.message,
            error
        );

        // Return a detailed error response
        res.status(500).json({
            error: `Failed to handle request. Resource=${resource}, Type=${type}, ID=${id}`,
            message: error.message,
            stack: error.stack,
        });
    }
});

// Start the Express server
app.listen(port, () => {
    console.log(`Addon running at http://localhost:${port}`);
});
