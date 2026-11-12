import { type ConfigPlugin, withAppBuildGradle } from "expo/config-plugins";

const withExcludeMedia3Dash: ConfigPlugin = (config) => {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;

    // Keep the unused Media3 DASH / SmoothStreaming / RTSP modules out of the app.
    // expo-audio asks for DASH and SmoothStreaming at an older Media3 release than
    // the player's (modules/exoplayer-player); nothing in the app plays those formats.
    const exclusionBlock = `
configurations.all {
    // Media3 modules the app does not use (expo-audio would pull in an older release of them)
    exclude group: 'androidx.media3', module: 'media3-exoplayer-dash'
    exclude group: 'androidx.media3', module: 'media3-exoplayer-smoothstreaming'
    exclude group: 'androidx.media3', module: 'media3-exoplayer-rtsp'
}
`;

    // Check if exclusion already exists
    if (contents.includes("media3-exoplayer-dash")) {
      return config;
    }

    // Insert before the dependencies block
    const dependenciesIndex = contents.indexOf("dependencies {");
    if (dependenciesIndex !== -1) {
      config.modResults.contents =
        contents.slice(0, dependenciesIndex) +
        exclusionBlock +
        "\n" +
        contents.slice(dependenciesIndex);
    }

    return config;
  });
};

export default withExcludeMedia3Dash;
