const fs = require('fs');

const dts = fs.readFileSync('node_modules/lucide-react-native/dist/lucide-react-native.d.ts', 'utf8');

const iconsToCheck = [
    'Edit', 'Pencil', 'CheckCircle'
];

const missing = [];

for (const icon of iconsToCheck) {
    if (!dts.includes(`declare const ${icon}:`)) {
        missing.push(icon);
    }
}

console.log('Missing icons:', missing);
