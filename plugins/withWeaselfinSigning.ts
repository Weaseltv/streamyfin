import { type ConfigPlugin, withAppBuildGradle } from "expo/config-plugins";

/**
 * Release signing for the WeaselPlex phone APK, exactly as
 * `dacrib-media-server/config/android/weaselplex-phone-build.md` describes:
 * the release signing config reads an external properties file named by the
 * `WEASELFIN_SIGNING_PROPS` environment variable (keys `weaselfin.storeFile`,
 * `weaselfin.storePassword`, `weaselfin.keyAlias`, `weaselfin.keyPassword`).
 * Nothing secret lives in the tree; when the variable is absent the release
 * build type keeps the debug signing config, as before.
 */
const SIGNING_CONFIG = `
        release {
            def weaselfinPropsPath = System.getenv("WEASELFIN_SIGNING_PROPS")
            if (weaselfinPropsPath != null && file(weaselfinPropsPath).exists()) {
                def weaselfinProps = new Properties()
                file(weaselfinPropsPath).withInputStream { weaselfinProps.load(it) }
                storeFile file(weaselfinProps["weaselfin.storeFile"])
                storePassword weaselfinProps["weaselfin.storePassword"]
                keyAlias weaselfinProps["weaselfin.keyAlias"]
                keyPassword weaselfinProps["weaselfin.keyPassword"]
                enableV1Signing true
                enableV2Signing true
                enableV3Signing true
                enableV4Signing true
            }
        }
`;

const withWeaselfinSigning: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;
    if (gradle.includes("WEASELFIN_SIGNING_PROPS")) return mod;

    // Add the release signing config right after the debug one.
    gradle = gradle.replace(
      /(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n\s*\}\n)/,
      `$1${SIGNING_CONFIG}`,
    );

    // The release build type selects it only when the properties file exists.
    // Note the `=`: without it Groovy parses the ternary as a method call.
    gradle = gradle.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      `$1def weaselfinSigningProps = System.getenv("WEASELFIN_SIGNING_PROPS")
            def useWeaselfinSigning = weaselfinSigningProps != null && file(weaselfinSigningProps).exists()
            signingConfig = useWeaselfinSigning ? signingConfigs.release : signingConfigs.debug`,
    );
    mod.modResults.contents = gradle;
    return mod;
  });

export default withWeaselfinSigning;
