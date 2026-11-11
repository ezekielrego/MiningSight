package co.techinn.miningsight.bridge;

import android.app.Application;
import android.content.Context;

import androidx.multidex.MultiDex;

import com.cySdkyc.clx.Helper;

/**
 * Loads the DJI V4 native runtime before any SDK class is used.
 */
public class BridgeApplication extends Application {
    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(base);
        BridgeLog.init(this);
        final Thread.UncaughtExceptionHandler previousHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            BridgeLog.error("CRASH", "Uncaught exception on " + thread.getName(), throwable);
            if (previousHandler != null) previousHandler.uncaughtException(thread, throwable);
        });
        MultiDex.install(this);
        Helper.install(this);
    }
}
