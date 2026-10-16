import { type ConfigPlugin, withAndroidManifest } from "expo/config-plugins";

/** Lets the main activity enter picture-in-picture. */
const withPictureInPictureManifest: ConfigPlugin = (config) =>
  withAndroidManifest(config, async (mod) => {
    const mainActivity =
      mod.modResults.manifest.application?.[0]?.activity?.find(
        (activity) => activity.$?.["android:name"] === ".MainActivity",
      );

    if (mainActivity?.$) {
      mainActivity.$["android:supportsPictureInPicture"] = "true";
    }

    return mod;
  });

export default withPictureInPictureManifest;
