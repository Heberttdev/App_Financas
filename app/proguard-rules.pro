# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Keep JavaScript interface for WebView
-keepclassmembers class com.financas.dividas.MainActivity$AndroidBridge {
    public *;
}

# Keep Firebase classes
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# Keep Kotlin metadata
-keepattributes *Annotation*

# Keep Tink (EncryptedSharedPreferences uses reflection with hardcoded class names)
-keep class com.google.crypto.tink.** { *; }
-dontwarn com.google.crypto.tink.**
-keep class androidx.security.crypto.** { *; }
-keepclassmembers class * extends com.google.crypto.tink.shaded.protobuf.GeneratedMessageLite { *; }

# Keep Room _Impl classes with empty constructor (WorkManager/WorkDatabase initializes via reflection)
-keep class * extends androidx.room.RoomDatabase {
    <init>();
}
-keepclassmembers class * extends androidx.room.RoomDatabase {
    *;
}
-keep class androidx.work.impl.WorkDatabase_Impl {
    <init>();
}