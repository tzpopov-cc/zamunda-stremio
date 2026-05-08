const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 7000;

const NEW_URL = 'https://zamunda-stremio.tzkppv.com';

// Manifest — keep serving so Stremio doesn't uninstall the addon
function buildManifest() {
    return {
        id: 'community.zamunda.bgaudio',
        version: '2.1.0',
        name: 'Zamunda BG ⚠️ ПРЕМЕСТЕН',
        description: 'Addon-ът се премести! Инсталирай отново от: ' + NEW_URL,
        logo: 'https://raw.githubusercontent.com/tzpopov-cc/zamunda-stremio/main/icon.png',
        background: 'https://zamunda.rip/static/pirateship.png',
        types: ['movie', 'series'],
        catalogs: [],
        resources: ['stream'],
        idPrefixes: ['tt'],
        behaviorHints: {
            configurable: true,
            configurationRequired: false
        }
    };
}

// Browser visits — redirect to new URL
app.get('/', (req, res) => res.redirect(301, NEW_URL));
app.get('/configure', (req, res) => res.redirect(301, NEW_URL));
app.get('/:config/configure', (req, res) => res.redirect(301, NEW_URL));

// Manifest — serve normally so addon stays "installed"
app.get('/manifest.json', (req, res) => res.json(buildManifest()));
app.get('/:config/manifest.json', (req, res) => res.json(buildManifest()));

// Streams — return a single "moved" message stream
app.get('/:config/stream/:type/:id.json', (req, res) => {
    res.json({
        streams: [{
            name: '⚠️ Zamunda BG',
            title: 'Addon-ът се премести!\n\nИнсталирай отново от:\n' + NEW_URL,
            externalUrl: NEW_URL,
        }]
    });
});

// Health
app.get('/health', (req, res) => res.json({ ok: true, mode: 'migration', redirect: NEW_URL }));

app.listen(PORT, () => {
    console.log(`Zamunda BG migration stub on port ${PORT} → ${NEW_URL}`);
});
