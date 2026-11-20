import {
  type ConfigPlugin,
  withMainActivity,
  withMainApplication,
} from "expo/config-plugins";

/**
 * Draws Android phones narrower than the iPhone at the iPhone's proportions.
 *
 * Both apps use the same layout numbers (an Android dp equals an iOS point),
 * but the owner's iPhone is 440 points wide and a Galaxy S24 Ultra is 384 dp,
 * so on Android every element took about 15% more of the screen: the third
 * poster in each row was cut off and settings rows wrapped (owner, round 1
 * parity review, Q1: "scale Android to the iPhone's proportions").
 *
 * On a phone whose smallest width is under 440 dp, the Application and the
 * Activity draw with a density scaled by smallest width / 440, so the screen
 * is 440 dp wide like the iPhone. Only the density is overridden: orientation
 * and screen size keep following the phone, and the smallest width (not the
 * current width) sets the scale, so portrait and landscape match. React
 * Native reads its window metrics from the Application's resources, native
 * dialogs from the Activity's, so both are wrapped. Tablets, TVs and phones
 * 440 dp or wider are unchanged. The same approach as WeaselTV's Android
 * phone app.
 *
 * React Native also keeps "screen" metrics read from the physical display,
 * and converts every layout and text size with their density. Left alone they
 * carry the phone's real density, so layout and text came out at the old size
 * inside a 440 dp window (labels cut off). They are re-synced to the scaled
 * density when the app starts and after every configuration change.
 */
const HELPER = `
/**
 * WeaselPlex: phones narrower than the iPhone (440 dp) draw at its proportions.
 * Added by plugins/withAndroidPhoneScale.ts.
 */
internal fun android.content.Context.weaselPlexPhoneScaled(): android.content.Context {
  val config = resources.configuration
  val uiType = config.uiMode and android.content.res.Configuration.UI_MODE_TYPE_MASK
  val smallestWidth = config.smallestScreenWidthDp
  if (uiType == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION) return this
  if (smallestWidth <= 0 || smallestWidth >= 440 || config.densityDpi <= 0) return this
  val scale = (smallestWidth / 440f).coerceAtLeast(0.85f)
  val override = android.content.res.Configuration().apply {
    densityDpi = Math.round(config.densityDpi * scale)
  }
  return createConfigurationContext(override)
}

/**
 * WeaselPlex: React Native's screen metrics use the scaled density (pixel sizes stay the
 * display's). Call on the Application context after React Native read its metrics.
 */
internal fun android.content.Context.weaselPlexSyncReactMetrics() {
  val window = resources.displayMetrics
  com.facebook.react.uimanager.DisplayMetricsHolder.initDisplayMetrics(this)
  val screen = com.facebook.react.uimanager.DisplayMetricsHolder.getScreenDisplayMetrics()
  if (screen.densityDpi == window.densityDpi) return
  val synced = android.util.DisplayMetrics()
  synced.setTo(screen)
  synced.density = window.density
  synced.densityDpi = window.densityDpi
  @Suppress("DEPRECATION")
  synced.scaledDensity = window.scaledDensity
  com.facebook.react.uimanager.DisplayMetricsHolder.setScreenDisplayMetrics(synced)
}
`;

const MARKER = "weaselPlexPhoneScaled";

const insertBeforeLastBrace = (source: string, block: string) => {
  const end = source.lastIndexOf("}");
  if (end < 0) throw new Error("withAndroidPhoneScale: class body not found");
  return `${source.slice(0, end)}${block}${source.slice(end)}`;
};

const withAndroidPhoneScale: ConfigPlugin = (config) => {
  // Phones only: the TV build never scales.
  if (process.env.EXPO_TV === "1") return config;

  config = withMainApplication(config, (mod) => {
    let src = mod.modResults.contents;
    if (src.includes(MARKER)) return mod;
    if (mod.modResults.language !== "kt") {
      throw new Error("withAndroidPhoneScale: MainApplication must be Kotlin");
    }
    const onCreate = "    super.onCreate()\n";
    if (!src.includes(onCreate)) {
      throw new Error(
        "withAndroidPhoneScale: MainApplication.onCreate not found",
      );
    }
    src = src.replace(
      onCreate,
      `${onCreate}    weaselPlexSyncReactMetrics()\n`,
    );
    src = insertBeforeLastBrace(
      src,
      `
  override fun attachBaseContext(base: android.content.Context) {
    super.attachBaseContext(base.weaselPlexPhoneScaled())
  }
`,
    );
    mod.modResults.contents = `${src}\n${HELPER}`;
    return mod;
  });

  config = withMainActivity(config, (mod) => {
    const src = mod.modResults.contents;
    if (src.includes(MARKER)) return mod;
    if (mod.modResults.language !== "kt") {
      throw new Error("withAndroidPhoneScale: MainActivity must be Kotlin");
    }
    mod.modResults.contents = insertBeforeLastBrace(
      src,
      `
  override fun attachBaseContext(newBase: android.content.Context) {
    super.attachBaseContext(newBase.weaselPlexPhoneScaled())
  }

  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    // React Native re-reads the display's real density here; scale it again.
    applicationContext.weaselPlexSyncReactMetrics()
  }
`,
    );
    return mod;
  });

  return config;
};

export default withAndroidPhoneScale;
