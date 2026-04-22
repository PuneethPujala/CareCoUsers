const globals = require("globals");
const js = require("@eslint/js");

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                ...globals.node,
                ...globals.jest
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-empty": "warn",
            "no-console": "off",
        }
    },
    {
        ignores: [
            "node_modules/**",
            "coverage/**",
            "*.log"
        ]
    }
];
