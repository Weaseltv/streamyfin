Pod::Spec.new do |s|
  s.name           = 'NowPlayingPlaceholder'
  s.version        = '1.0.0'
  s.summary        = 'Seeds the iOS Now Playing center with the app icon while nothing plays'
  s.description    = 'The AirPlay route picker shows the Now Playing artwork in its head. This fills that slot with the app icon while the cast sheet is open and nothing is playing.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.6', :tvos => '15.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'MediaPlayer'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
