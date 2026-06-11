const fs = require('fs');
const path = require('path');

function createLottie(color) {
    return {
        "v": "5.5.2",
        "fr": 30,
        "ip": 0,
        "op": 30,
        "w": 100,
        "h": 100,
        "nm": "Comp 1",
        "ddd": 0,
        "assets": [],
        "layers": [
            {
                "ty": 4,
                "nm": "Shape Layer 1",
                "sr": 1,
                "st": 0,
                "op": 30,
                "ip": 0,
                "ks": {
                    "o": {"a": 0, "k": 100},
                    "r": {"a": 0, "k": 0},
                    "p": {"a": 0, "k": [50, 50, 0]},
                    "a": {"a": 0, "k": [0, 0, 0]},
                    "s": {
                        "a": 1,
                        "k": [
                            {"i": {"x": [0.667], "y": [1]}, "o": {"x": [0.333], "y": [0]}, "t": 0, "s": [50, 50, 100]},
                            {"i": {"x": [0.667], "y": [1]}, "o": {"x": [0.333], "y": [0]}, "t": 15, "s": [100, 100, 100]},
                            {"t": 30, "s": [50, 50, 100]}
                        ]
                    }
                },
                "shapes": [
                    {
                        "ty": "el",
                        "nm": "Ellipse Path 1",
                        "p": {"a": 0, "k": [0, 0]},
                        "s": {"a": 0, "k": [50, 50]}
                    },
                    {
                        "ty": "fl",
                        "nm": "Fill 1",
                        "c": {"a": 0, "k": color},
                        "o": {"a": 0, "k": 100}
                    }
                ]
            }
        ]
    };
}

// sad = blue [0.23, 0.51, 0.96, 1]
// okay = gray [0.5, 0.5, 0.5, 1]
// good = green [0.2, 0.8, 0.2, 1]
// great = yellow [0.98, 0.8, 0.05, 1]

const lotties = {
    sad: [0.23, 0.51, 0.96, 1],
    okay: [0.5, 0.5, 0.5, 1],
    good: [0.2, 0.8, 0.2, 1],
    great: [0.98, 0.8, 0.05, 1]
};

const dir = path.join(__dirname, 'src', 'assets', 'lottie');
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

for (const [name, color] of Object.entries(lotties)) {
    const json = JSON.stringify(createLottie(color));
    fs.writeFileSync(path.join(dir, name + '.json'), json);
}

console.log('Successfully created visible placeholder Lottie animations.');
