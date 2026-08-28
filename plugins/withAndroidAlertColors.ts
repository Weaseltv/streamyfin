import {
  type ConfigPlugin,
  withAndroidColors,
  withAndroidColorsNight,
} from "expo/config-plugins";

// WeaselPlex prismatic cyan. Duplicated rather than imported because config
// plugins run in the Node build context, outside the app's module graph.
const ALERT_ACCENT = "#00C0FF";

interface ColorResourceItem {
  $: { name: string };
  _: string;
}

const withAndroidAlertColors: ConfigPlugin = (config) => {
  const setColor = (
    colorsList: ColorResourceItem[],
    name: string,
    value: string,
  ) => {
    const existingColor = colorsList.find(
      (item) => item.$ && item.$.name === name,
    );
    if (existingColor) {
      existingColor._ = value;
    } else {
      colorsList.push({
        $: { name },
        _: value,
      });
    }
  };

  config = withAndroidColors(config, (config) => {
    const colors = config.modResults;
    const colorsList = (colors.resources.color ?? []) as ColorResourceItem[];
    setColor(colorsList, "colorPrimary", ALERT_ACCENT);
    colors.resources.color = colorsList;
    return config;
  });

  config = withAndroidColorsNight(config, (config) => {
    const colors = config.modResults;
    const colorsList = (colors.resources.color ?? []) as ColorResourceItem[];
    setColor(colorsList, "colorPrimary", ALERT_ACCENT);
    colors.resources.color = colorsList;
    return config;
  });

  return config;
};

export default withAndroidAlertColors;
