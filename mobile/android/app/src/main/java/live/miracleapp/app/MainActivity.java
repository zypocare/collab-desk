package live.miracleapp.app;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // No scrollbar on the side of the screen: pages still scroll, like a native app.
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) return; // no WebView on this phone: Capacitor shows its own screen
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
    }
}
