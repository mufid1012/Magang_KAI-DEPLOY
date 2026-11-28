package id.daop6.ppjkai;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Android 13+: without this the "tracking aktif" notification of the GPS service is hidden.
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1);
        }
        askBatteryExemption();
    }

    // Battery optimisation (aggressive on Xiaomi/Oppo/Vivo) can stop GPS with the screen off.
    // ponytail: only the stock Android prompt; vendor-specific autostart screens still need the PPJ manual.
    @SuppressLint("BatteryLife")
    private void askBatteryExemption() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm == null || pm.isIgnoringBatteryOptimizations(getPackageName())) return;
        try {
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
        } catch (Exception ignored) {
            // Some vendor ROMs lack this screen; tracking still works, only less reliably.
        }
    }
}
