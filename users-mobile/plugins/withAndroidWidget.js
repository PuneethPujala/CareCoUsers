const { withAndroidManifest, withMainApplication } = require('@expo/config-plugins');

const withAndroidWidget = (config) => {
  // 1. Modify AndroidManifest.xml
  config = withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];

    if (!mainApplication.receiver) {
      mainApplication.receiver = [];
    }

    // Check if receiver already exists to prevent duplicates
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

  // 2. Modify MainApplication.kt
  config = withMainApplication(config, async (config) => {
    let contents = config.modResults.contents;

    const packageRegistration = 'add(WidgetPackage())';
    
    // Inject add(WidgetPackage()) into the getPackages() method
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
