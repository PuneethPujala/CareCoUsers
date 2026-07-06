const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'node_modules', 'expo-app-metrics', 'package.json');
if (fs.existsSync(target)) {
  let content = fs.readFileSync(target, 'utf8');
  if (content.includes('"expo-updates-interface": "~55.1.6"')) {
    content = content.replace('"expo-updates-interface": "~55.1.6"', '"expo-updates-interface": "~2.0.0"');
    fs.writeFileSync(target, content, 'utf8');
    console.log('Successfully patched expo-app-metrics package.json!');
  } else {
    console.log('expo-app-metrics package.json is already patched or correct version.');
  }
} else {
  console.log('expo-app-metrics not found in node_modules.');
}
