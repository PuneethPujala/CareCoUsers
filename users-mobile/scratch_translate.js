const fs = require('fs');
const files = [
    'src/screens/patient/ProfileScreen.jsx',
    'src/screens/patient/HomeScreen.jsx',
    'src/screens/patient/MedicationsScreen.jsx',
    'src/screens/patient/AdherenceScreen.jsx'
];
files.forEach(file => {
    if (!fs.existsSync(file)) return;
    try {
        let content = fs.readFileSync(file, 'utf8');
        let modified = false;

        const regexes = [
            /<Text style=\{(?:s|styles)\.sectionTitle\}>([^<]+)<\/Text>/g,
            /<Text style=\{(?:s|styles)\.heroLabel\}>([^<]+)<\/Text>/g,
            /<Text style=\{(?:s|styles)\.headerTitle\}>([^<]+)<\/Text>/g,
            /<Text style=\{(?:s|styles)\.cardTitle\}>([^<]+)<\/Text>/g,
            /<Text style=\{(?:s|styles)\.emptyTitle\}>([^<]+)<\/Text>/g,
            /<Text style=\{(?:s|styles)\.emptySub\}>([^<]+)<\/Text>/g,
            /<Text style=\{(?:s|styles)\.syncTitle\}>([^<]+)<\/Text>/g,
            /<Text style=\{(?:s|styles)\.heroGreeting\}>([^<]+)<\/Text>/g,
            /<Text style=\{(?:s|styles)\.statLabel\}>([^<]+)<\/Text>/g,
        ];

        regexes.forEach(regex => {
            content = content.replace(regex, (match, text) => {
                if (text.includes('t(')) return match;
                if (text.includes('{')) return match;
                
                const key = text.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
                modified = true;
                return match.replace(text, `{t('common.${key}', { defaultValue: '${text}' })}`);
            });
        });

        if (modified) {
            if (!content.includes('useTranslation')) {
                content = content.replace(/(import React.*?from 'react';)/, "$1\nimport { useTranslation } from 'react-i18next';");
            }
            if (!content.includes('const { t } = useTranslation()')) {
                content = content.replace(/(export default function .*?\(\{.*?\}\) \{|export default function .*?\(.*?\) \{)/, "$1\n    const { t } = useTranslation();");
            }
            fs.writeFileSync(file, content, 'utf8');
            console.log('Updated ' + file);
        }
    } catch (e) {
        console.error('Error processing ' + file + ':', e.message);
    }
});
