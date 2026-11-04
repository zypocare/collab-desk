# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ---- Miracle ----
# The shell is small; R8 shrinks and optimises it, but these are found by name at run time and must stay.

# Capacitor (its own library ships rules for plugins; this also keeps the bridge, the config and the
# SystemBars and WebView pieces it looks up), and the plugins the app uses.
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.plugins.** { *; }
-keep class app.capgo.** { *; }
-keep class live.miracleapp.app.** { *; }

# Methods the web page calls through the WebView's JavaScript bridge.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Plugin annotations are read at run time.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Readable crash reports in Play Console (the mapping file maps the names back).
-keepattributes SourceFile,LineNumberTable
