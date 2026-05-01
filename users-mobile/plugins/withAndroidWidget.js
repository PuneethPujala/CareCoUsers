const { withAndroidManifest, withMainApplication, withStringsXml, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withAndroidWidget = (config) => {
  // 1. Copy widget source files
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidDir = path.join(projectRoot, 'android', 'app', 'src', 'main');
      const widgetSourceDir = path.join(projectRoot, 'widget-source');

      const copyRecursiveSync = function(src, dest) {
        if (!fs.existsSync(src)) return;
        var stats = fs.statSync(src);
        var isDirectory = stats.isDirectory();
        if (isDirectory) {
          if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
          }
          fs.readdirSync(src).forEach(function(childItemName) {
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
          });
        } else {
          fs.copyFileSync(src, dest);
        }
      };

      copyRecursiveSync(widgetSourceDir, androidDir);
      return config;
    },
  ]);

  // 2. Inject string resources
  config = withStringsXml(config, (config) => {
    const strings = config.modResults.resources.string || [];
    
    const addString = (name, value) => {
      if (!strings.find(s => s.$.name === name)) {
        strings.push({ $: { name }, _: value });
      }
    };

    addString('widget_label', 'CareMyMed Medicines');
    addString('widget_description', 'Track your daily medication progress at a glance');
    
    config.modResults.resources.string = strings;
    return config;
  });

  // 3. Modify AndroidManifest.xml
  config = withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];

    if (!mainApplication.receiver) {
      mainApplication.receiver = [];
    }

    const existingReceiver = mainApplication.receiver.find(
      (r) => r.$['android:name'] === '.MedicineWidgetProvider'
    );

    if (!existingReceiver) {
      mainApplication.receiver.push({
        $: {
          'android:name': '.MedicineWidgetProvider',
          'android:exported': 'true',
          'android:label': '@string/widget_label',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/medicine_widget_info',
            },
          },
        ],
      });
    }

    return config;
  });

  // 4. Modify MainApplication.kt
  config = withMainApplication(config, async (config) => {
    let contents = config.modResults.contents;

    const packageRegistration = 'add(WidgetPackage())';
    
    if (!contents.includes(packageRegistration)) {
      contents = contents.replace(
        /(PackageList\(this\)\.packages\.apply\s*\{)([\s\S]*?)(\})/,
        (match, p1, p2, p3) => {
          return `${p1}${p2}              ${packageRegistration}\n            ${p3}`;
        }
      );
    }

    config.modResults.contents = contents;
    return config;
  });

  return config;
};

module.exports = withAndroidWidget;
