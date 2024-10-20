const express = require('express');
const axios = require('axios');
const { addonBuilder } = require('stremio-addon-sdk');

const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;
const OPENSUBTITLES_API = 'https://api.opensubtitles.org/api/v1/subtitles';

const builder = new addonBuilder({
    id: 'org.stremio.translated-subtitles',
    version: '1.1.0',
    name: 'Hebrew Subtitles Translator (EN to HE)',
    description: 'Provides Hebrew subtitles and translates if needed.',
    resources: ['subtitles'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [],  // Empty array if you don't use catalogs
});

// Subtitles handler
builder.defineSubtitlesHandler(async ({ id, type, extra }) => {
    try {
        console.log(`Fetching subtitles for ${id}...`);

        // Step 1: Check if Hebrew subtitles are available
        const hebrewResponse = await axios.get(
            `${OPENSUBTITLES_API}?imdb_id=${id}&languages=he`
        );
        const hebrewSubtitles = hebrewResponse.data.data;

        if (hebrewSubtitles && hebrewSubtitles.length > 0) {
            console.log('Hebrew subtitles found. Returning them.');
            // Return the Hebrew subtitles if available
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

        // Step 2: If no Hebrew subtitles, fetch English subtitles
        const englishResponse = await axios.get(
            `${OPENSUBTITLES_API}?imdb_id=${id}&languages=en`
        );
        const englishSubtitles = englishResponse.data.data[0];

        if (!englishSubtitles) throw new Error('No English subtitles found.');

        // Step 3: Download and translate English subtitles to Hebrew
        const subtitleContent = await axios.get(
            englishSubtitles.attributes.url,
            { responseType: 'text' }
        );

        console.log('Translating English subtitles to Hebrew...');
        const translated = await translateText(
            subtitleContent.data,
            'en',
            'he'
        );

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

// Google Translate API helper function
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

// Start the addon server
const app = express();
const port = process.env.PORT || 7000;
app.use(builder.getInterface());
app.listen(port, () =>
    console.log(`Addon running at http://localhost:${port}`)
);
