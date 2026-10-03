import { type ConfigPlugin, withAndroidManifest } from "expo/config-plugins";

const withGoogleCastAndroidManifest: ConfigPlugin = (config) =>
  withAndroidManifest(config, async (mod) => {
    const mainApplication = mod.modResults.manifest.application?.[0];

    if (!mainApplication) {
      return mod;
    }

    // Initialize activity array if it doesn't exist
    if (!mainApplication.activity) {
      mainApplication.activity = [];
    }

    const googleCastActivityExists = mainApplication.activity.some(
      (activity) =>
        activity.$?.["android:name"] ===
        "com.reactnative.googlecast.RNGCExpandedControllerActivity",
    );

    // Only add the activity if it doesn't already exist
    if (!googleCastActivityExists) {
      mainApplication.activity.push({
        $: {
          "android:name":
            "com.reactnative.googlecast.RNGCExpandedControllerActivity",
          "android:theme": "@style/Theme.MaterialComponents.NoActionBar",
          "android:launchMode": "singleTask",
          "android:exported": "false",
        },
      });
    }

    const mainActivity = mainApplication.activity.find(
      (activity) => activity.$?.["android:name"] === ".MainActivity",
    );

    if (mainActivity?.$) {
      mainActivity.$["android:supportsPictureInPicture"] = "true";
    }

    // Android 11+ package visibility: `Linking.sendIntent` resolves the
    // activity before launching it, and the system settings pages the cast
    // sheet opens for screen mirroring are hidden unless declared here.
    // Keep this list in step with SCREEN_MIRRORING_INTENTS in
    // components/cast/CastDialog.tsx.
    const mirroringActions = [
      "android.settings.CAST_SETTINGS",
      "com.samsung.wfd.LAUNCH_WFD_PICKER_DLG",
      "android.settings.WIFI_DISPLAY_SETTINGS",
    ];
    const manifest = mod.modResults.manifest;
    if (!manifest.queries) manifest.queries = [];
    const queries = manifest.queries[0] ?? {};
    if (!manifest.queries[0]) manifest.queries.push(queries);
    if (!queries.intent) queries.intent = [];
    for (const action of mirroringActions) {
      const declared = queries.intent.some((intent) =>
        intent.action?.some((a) => a.$?.["android:name"] === action),
      );
      if (!declared) {
        queries.intent.push({ action: [{ $: { "android:name": action } }] });
      }
    }

    return mod;
  });

export default withGoogleCastAndroidManifest;
