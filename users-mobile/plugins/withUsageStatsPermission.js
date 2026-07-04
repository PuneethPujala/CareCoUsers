const { withAndroidManifest } = require('@expo/config-plugins');

const withUsageStatsPermission = (config) => {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    if (!androidManifest.manifest['uses-permission']) {
      androidManifest.manifest['uses-permission'] = [];
    }

    const hasPermission = androidManifest.manifest['uses-permission'].some(
      (p) => p.$['android:name'] === 'android.permission.PACKAGE_USAGE_STATS'
    );

    if (!hasPermission) {
      androidManifest.manifest['uses-permission'].push({
        $: {
          'android:name': 'android.permission.PACKAGE_USAGE_STATS',
          'tools:ignore': 'ProtectedPermissions',
        },
      });
    }

    return config;
  });
};

module.exports = withUsageStatsPermission;
