const fs = require('fs');

const path = 'c:\\dev\\CareCoUsers\\users-app\\src\\screens\\onboarding\\PatientSignupScreen.jsx';
let content = fs.readFileSync(path, 'utf8');

const swaps = {
  '#6366F1': '#3B5BDB',
  '#4338CA': '#1E3A8A',
  '#38BDF8': '#60A5FA',
  '#EEF2FF': '#EFF3FF',
  '#F8FAFC': '#EEF1FF',
  '#E2E8F0': '#D0D9F5',
  '#F1F5F9': '#E8EDFF',
  '#94A3B8': '#8899BB',
  '#334155': '#3D4F7C',
  '#0F172A': '#0D1B4B',
  '#0EA5E9': '#3B5BDB',
  '#E0F2FE': '#EFF3FF',
  '#F0F9FF': '#EFF3FF',
  '#BAE6FD': '#A5B4FC',
  '#0369A1': '#1E3A8A',
  '#1E40AF': '#1E3A8A',
  // Specific complex swaps
  "backgroundColor: '#F0F7FF'": "backgroundColor: 'rgba(239,243,255,0.9)'",
  "colors={['#F0FFF4', '#FFFFFF']}": "colors={['#EFF3FF', '#FFFFFF']}",
  "shadowColor: '#22C55E'": "shadowColor: '#3B5BDB'",
  "colors={['#6366F1', '#4338CA']}": "colors={['#3B5BDB', '#1E3A8A']}",
  "shadowColor: '#4338CA'": "shadowColor: '#1E3A8A'",
};

for (const [key, value] of Object.entries(swaps)) {
  content = content.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), value);
}

fs.writeFileSync(path, content, 'utf8');
